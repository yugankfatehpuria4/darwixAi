import { randomUUID } from "node:crypto";
import { answerQuestion } from "./answer";
import type { MarketPack, SlotSpec } from "./market";
import { looksLikeQuestion, toIsoDate, yesNo } from "./parse";
import type { BotReply, CallState, Outcome, RetrievalTrace, SlotValue, Turn, TurnInput } from "./types";

// Below this the recogniser is guessing; asking again is cheaper than
// acting on a misheard age or date. Chrome reports 0 when it has no
// estimate, which we treat as "unknown", not "unclear".
const MIN_ASR_CONFIDENCE = 0.45;
const MAX_SILENCES = 2;
const MAX_UNCLEAR = 3;

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);
}

function say(pack: MarketPack, state: CallState, key: string, extra: Record<string, string> = {}): string {
  const line = pack.lines[key];
  if (!line) throw new Error(`Market ${pack.market} has no line "${key}"`);
  const template = line[state.register] ?? line[pack.default_register];
  return fill(template, { ...pack.vars(state), ...extra });
}

function currentSlot(pack: MarketPack, state: CallState): SlotSpec | undefined {
  return pack.slots.find((slot) => state.slots[slot.name] === undefined && !state.skipped.includes(slot.name));
}

function withoutQuestions(text: string): string {
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text];
  const statements = sentences.filter((sentence) => !sentence.trim().endsWith("?"));
  return statements.length ? statements.join("").trim() : text;
}

/** Script wording is written for any customer ("Ma'am/Sir", "Bapak/Ibu"); say the one that applies. */
function personalise(pack: MarketPack, state: CallState, text: string): string {
  let personal = text;
  for (const [generic, varName] of Object.entries(pack.address_terms ?? {})) {
    personal = personal.split(generic).join(pack.vars(state)[varName] ?? generic);
  }
  return personal;
}

const sameValue = (a: SlotValue["value"], b: SlotValue["value"]) => JSON.stringify(a) === JSON.stringify(b);

function replyOf(pack: MarketPack, state: CallState, parts: string[], retrieval?: RetrievalTrace): BotReply {
  const register = pack.registers[state.register] ?? pack.registers[pack.default_register];
  return {
    text: parts.filter(Boolean).join(" "),
    register: state.register,
    tts_locale: register.tts_locale,
    asr_locale: register.asr_locale,
    ended: state.stage === "ended",
    escalated: state.escalated,
    retrieval,
    outcome: state.outcome,
  };
}

export function startCall(pack: MarketPack, now = new Date()): { state: CallState; reply: BotReply } {
  const state: CallState = {
    call_id: `call_${toIsoDate(now).replace(/-/g, "")}_${randomUUID().slice(0, 8)}`,
    market: pack.market,
    started_at: now.toISOString(),
    today: toIsoDate(now),
    stage: "consent",
    register: pack.default_register,
    slots: {},
    skipped: [],
    pending_conflict: null,
    unanswered_questions: 0,
    consecutive_silence: 0,
    consecutive_unclear: 0,
    disclosures_given: ["recording"],
    identity_attempts: 0,
    outcome: null,
    escalated: false,
    turns: [],
    latencies: [],
    known_pii: [],
  };
  pack.setup(state);
  const text = say(pack, state, "greeting");
  state.turns.push({ index: 0, speaker: "bot", text, at: now.toISOString(), register: state.register, intent: "greeting" });
  return { state, reply: replyOf(pack, state, [text]) };
}

function finish(pack: MarketPack, state: CallState, outcome: Outcome, lineKey: string, parts: string[]): void {
  state.outcome = outcome;
  state.stage = "ended";
  parts.push(say(pack, state, lineKey));
}

function escalate(pack: MarketPack, state: CallState, reason: string, parts: string[]): void {
  const { outcome, line } = pack.escalationOutcome(state, reason);
  state.escalated = true;
  finish(pack, state, outcome, line, parts);
}

/** Stores an extracted value, or opens a conflict question. Returns false if the turn must stop here. */
function storeSlot(pack: MarketPack, state: CallState, slot: SlotSpec, incoming: SlotValue, text: string, parts: string[]): boolean {
  const existing = state.slots[slot.name];
  if (existing && !sameValue(existing.value, incoming.value) && !pack.patterns.correction.test(text)) {
    state.pending_conflict = { slot: slot.name, previous: existing, incoming };
    state.stage = "confirm_conflict";
    const describe = (value: SlotValue["value"]) => (slot.describe ? slot.describe(value, state.register) : String(value));
    parts.push(say(pack, state, "conflict", { previous: describe(existing.value), incoming: describe(incoming.value) }));
    return false;
  }
  state.slots[slot.name] = incoming;
  state.skipped = state.skipped.filter((name) => name !== slot.name);
  const after = pack.afterSlot?.(slot.name, state);
  if (after) parts.push(say(pack, state, after));
  return true;
}

interface TurnTimings {
  retrieval_ms?: number;
  llm_ms?: number;
}

export async function handleTurn(pack: MarketPack, state: CallState, input: TurnInput, now = new Date()): Promise<{ reply: BotReply; timings: TurnTimings }> {
  if (state.stage === "ended") throw new Error(`Call ${state.call_id} has already ended (${state.outcome?.status})`);
  const parts: string[] = [];
  const timings: TurnTimings = {};
  let retrieval: RetrievalTrace | undefined;
  const text = input.text?.trim() ?? "";
  const turn: Turn = { index: state.turns.length, speaker: "customer", text, at: now.toISOString(), event: input.event, asr_confidence: input.asr_confidence, barged_in: input.barged_in, intent: "" };
  state.turns.push(turn);

  const done = () => {
    const reply = replyOf(pack, state, parts, retrieval);
    state.turns.push({ index: state.turns.length, speaker: "bot", text: reply.text, at: new Date().toISOString(), register: state.register, retrieval });
    return { reply, timings };
  };

  const ask = (slot?: SlotSpec) => {
    if (state.stage === "consent") parts.push(say(pack, state, "consent_repeat"));
    else if (slot) parts.push(say(pack, state, slot.prompt));
  };

  if (input.event === "silence") {
    turn.intent = "silence";
    state.consecutive_silence++;
    if (state.consecutive_silence >= MAX_SILENCES) {
      finish(pack, state, { status: "no_response", next_action: "advisor_callback", reasons: [`${MAX_SILENCES} consecutive silences`], rule_sources: [] }, "silence_end", parts);
    } else {
      parts.push(say(pack, state, "silence"));
      ask(currentSlot(pack, state));
    }
    return done();
  }

  const unclear = input.event === "asr_error" || !text || (input.asr_confidence !== undefined && input.asr_confidence > 0 && input.asr_confidence < MIN_ASR_CONFIDENCE);
  if (unclear) {
    turn.intent = input.event === "asr_error" ? "asr_error" : "low_confidence";
    state.consecutive_unclear++;
    if (state.consecutive_unclear >= MAX_UNCLEAR) escalate(pack, state, `${MAX_UNCLEAR} consecutive turns the recogniser could not transcribe`, parts);
    else parts.push(say(pack, state, "unclear"));
    return done();
  }
  state.consecutive_silence = 0;
  state.consecutive_unclear = 0;
  state.register = pack.detectRegister(text, state.register);
  turn.register = state.register;

  if (pack.patterns.do_not_call.test(text)) {
    turn.intent = "do_not_call";
    finish(pack, state, { status: "do_not_call", next_action: "mark_number_do_not_call", reasons: ["customer asked not to be called again"], rule_sources: [] }, "do_not_call", parts);
    return done();
  }
  if (pack.patterns.escalation.test(text)) {
    turn.intent = "escalation_request";
    escalate(pack, state, "customer asked for a human", parts);
    return done();
  }

  if (state.stage === "consent") {
    const answer = yesNo(text);
    if (answer === "yes") {
      turn.intent = "consent_yes";
      state.stage = "collect";
      ask(currentSlot(pack, state));
    } else if (answer === "no") {
      turn.intent = "consent_no";
      finish(pack, state, { status: pack.declined.status, next_action: pack.declined.next_action, reasons: ["declined the opening question"], rule_sources: [] }, pack.declined.line, parts);
    } else {
      turn.intent = "consent_unclear";
      parts.push(say(pack, state, "consent_repeat"));
    }
    return done();
  }

  if (state.stage === "confirm_conflict" && state.pending_conflict) {
    const { slot: slotName, previous, incoming } = state.pending_conflict;
    const slot = pack.slots.find((candidate) => candidate.name === slotName)!;
    const restated = slot.extract(text, true, state);
    let kept: SlotValue;
    if (restated !== undefined) kept = { value: restated, heard: text, turn: turn.index };
    else kept = yesNo(text) === "no" ? previous : incoming;
    state.slots[slotName] = kept;
    state.pending_conflict = null;
    state.stage = "collect";
    turn.intent = `conflict_resolved:${slotName}`;
    parts.push(say(pack, state, "conflict_kept", { value: slot.describe ? slot.describe(kept.value, state.register) : String(kept.value) }));
  } else {
    const asked = currentSlot(pack, state);
    const intents: string[] = [];

    const objection = pack.objections.find((candidate) => candidate.pattern.test(text) && !candidate.unless?.test(text));
    if (objection) {
      intents.push(`objection:${objection.id}`);
      const answer = await answerQuestion({
        question: objection.query,
        market: pack.market,
        company: pack.company,
        register_instruction: pack.registers[state.register].llm_instruction,
        categories: ["objection"],
        audience: "agent",
      });
      timings.retrieval_ms = answer.retrieval_ms;
      timings.llm_ms = answer.llm_ms;
      retrieval = answer.trace;
      // Script wording often carries its own questions ("Which of these
      // would help most?", "When can you pay?"). The flow asks its next
      // question right after, and two questions in one breath confuse
      // callers, so the script's questions are dropped. Removing sentences
      // never adds an ungrounded claim.
      const continuing = !objection.ends_with && currentSlot(pack, state) !== undefined;
      if (answer.text) parts.push(personalise(pack, state, continuing ? withoutQuestions(answer.text) : answer.text));
      else parts.push(say(pack, state, "fallback"));
      if (objection.ends_with) {
        finish(pack, state, { status: objection.ends_with.status, next_action: objection.ends_with.next_action, reasons: [`objection: ${objection.id}`], rule_sources: [] }, objection.ends_with.line, parts);
        turn.intent = intents.join(",");
        return done();
      }
    }

    let stopped = false;
    for (const slot of pack.slots) {
      const value = slot.extract(text, slot === asked, state);
      if (value === undefined) continue;
      if (slot.verify && !slot.verify(value, state)) {
        intents.push(`verify_failed:${slot.name}`);
        state.identity_attempts++;
        if (state.identity_attempts >= 2) {
          turn.intent = intents.join(",");
          escalate(pack, state, `could not verify ${slot.name} after 2 attempts`, parts);
          return done();
        }
        parts.push(say(pack, state, "verify_failed"));
        stopped = true;
        break;
      }
      intents.push(`slot:${slot.name}`);
      if (!storeSlot(pack, state, slot, { value, heard: text, turn: turn.index }, text, parts)) {
        stopped = true;
        break;
      }
    }

    const filledSomething = intents.some((intent) => intent.startsWith("slot:"));
    if (!stopped && asked && !filledSomething && !objection && pack.patterns.dont_know.test(text) && !looksLikeQuestion(text)) {
      intents.push(`skipped:${asked.name}`);
      state.skipped.push(asked.name);
      parts.push(say(pack, state, "noted_skip"));
    }

    if (!stopped && !objection && looksLikeQuestion(text, filledSomething)) {
      intents.push("question");
      const answer = await answerQuestion({
        question: text,
        market: pack.market,
        company: pack.company,
        register_instruction: pack.registers[state.register].llm_instruction,
      });
      timings.retrieval_ms = answer.retrieval_ms;
      timings.llm_ms = answer.llm_ms;
      retrieval = answer.trace;
      if (answer.text) {
        parts.push(personalise(pack, state, answer.text));
      } else {
        state.unanswered_questions++;
        intents.push("unanswered");
        if (state.unanswered_questions >= pack.max_unanswered_questions) {
          turn.intent = intents.join(",");
          escalate(pack, state, `${state.unanswered_questions} questions the knowledge base could not answer`, parts);
          return done();
        }
        parts.push(say(pack, state, "fallback"));
      }
    }

    if (!intents.length) {
      intents.push("not_understood");
      parts.push(say(pack, state, "unclear_answer"));
    }
    turn.intent = intents.join(",");
    if (stopped) return done();
  }

  const next = currentSlot(pack, state);
  if (next) {
    ask(next);
  } else {
    const outcome = pack.decide(state);
    finish(pack, state, outcome, pack.outcomeLine(outcome, state), parts);
  }
  return done();
}
