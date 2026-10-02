import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { redactPii } from "../kb/pii";
import type { Market } from "../kb/types";
import { escapeRegExp } from "../text";
import { log } from "../log";
import { recordLead, type LeadRecord } from "./actions";
import { handleTurn, startCall } from "./dialogue";
import type { MarketPack } from "./market";
import { healthPack } from "./markets/health";
import { idFinancePack } from "./markets/id-finance";
import { phLifePack } from "./markets/ph-life";
import type { BotReply, CallState, TurnInput } from "./types";

export const PACKS: Record<Market, MarketPack> = {
  in_health: healthPack,
  ph_life: phLifePack,
  id_finance: idFinancePack,
};

const CALLS_DIR = path.resolve("runtime/calls");

// In-memory for the demo: one process, a handful of concurrent calls. At
// scale this moves to Redis keyed by call_id (see docs/scaling.md).
const live = new Map<string, CallState>();

/** Transcript as written to disk: PII patterns and the known account values masked. */
export function redactedCopy(state: CallState): CallState {
  const mask = (text: string) => {
    let masked = text;
    for (const { value, label } of state.known_pii) {
      // Whole words only: "Ana" must not eat the middle of "pinagdadaanan".
      masked = masked.replace(new RegExp(`(?<!\\p{L})${escapeRegExp(value)}(?!\\p{L})`, "giu"), `[${label}]`);
    }
    return redactPii(masked).text;
  };
  return {
    ...state,
    known_pii: [],
    account: undefined,
    turns: state.turns.map((turn) => ({ ...turn, text: mask(turn.text) })),
    slots: Object.fromEntries(Object.entries(state.slots).map(([name, slot]) => [name, { ...slot, heard: mask(slot.heard) }])),
  };
}

async function persist(state: CallState): Promise<void> {
  await mkdir(CALLS_DIR, { recursive: true });
  await writeFile(path.join(CALLS_DIR, `${state.call_id}.json`), JSON.stringify(redactedCopy(state), null, 2));
}

export async function createCall(market: Market, now = new Date()): Promise<{ state: CallState; reply: BotReply }> {
  const pack = PACKS[market];
  if (!pack) throw new Error(`Unknown market "${market}"; expected one of ${Object.keys(PACKS).join(", ")}`);
  const { state, reply } = startCall(pack, now);
  live.set(state.call_id, state);
  await persist(state);
  log("call.started", { call_id: state.call_id, market });
  return { state, reply };
}

export function getLiveCall(callId: string): CallState | undefined {
  return live.get(callId);
}

export async function takeTurn(callId: string, input: TurnInput, now = new Date()): Promise<{ reply: BotReply; lead?: LeadRecord; state: CallState }> {
  const state = live.get(callId);
  if (!state) throw new Error(`No live call with id ${callId}`);
  const started = performance.now();
  const { reply, timings } = await handleTurn(PACKS[state.market], state, input, now);
  const serverTotal = Math.round((performance.now() - started) * 10) / 10;
  state.latencies.push({
    turn: state.turns.length - 2,
    asr_ms: input.client_timing?.asr_ms,
    understand_ms: Math.max(0, Math.round((serverTotal - (timings.retrieval_ms ?? 0) - (timings.llm_ms ?? 0)) * 10) / 10),
    retrieval_ms: timings.retrieval_ms,
    llm_ms: timings.llm_ms,
    server_total_ms: serverTotal,
  });
  log("call.turn", {
    call_id: callId,
    turn: state.turns.length - 2,
    intent: state.turns.at(-2)?.intent,
    chunk_ids: reply.retrieval?.chunk_ids,
    retrieval_confidence: reply.retrieval?.confidence,
    answer_mode: reply.retrieval?.answer_mode,
    fallback_reason: reply.retrieval && !reply.retrieval.answerable ? reply.retrieval.reason : undefined,
    llm_error: reply.retrieval?.llm_error,
    server_ms: serverTotal,
  });

  let lead: LeadRecord | undefined;
  if (reply.ended) {
    lead = await recordLead(state);
    live.delete(callId);
    log("call.ended", { call_id: callId, status: state.outcome?.status, next_action: state.outcome?.next_action, escalated: state.escalated });
  }
  await persist(state);
  return { reply, lead, state };
}

/** Browser-measured timings arrive after the reply was spoken, so they are attached late. */
export function attachClientTiming(callId: string, turn: number, timing: { tts_start_ms?: number }): void {
  const state = live.get(callId);
  const entry = state?.latencies.find((latency) => latency.turn === turn);
  if (entry && timing.tts_start_ms !== undefined) entry.tts_start_ms = timing.tts_start_ms;
}

export async function listStoredCalls(): Promise<Array<Pick<CallState, "call_id" | "market" | "started_at" | "outcome" | "escalated">>> {
  await mkdir(CALLS_DIR, { recursive: true });
  const files = (await readdir(CALLS_DIR)).filter((file) => file.endsWith(".json")).sort().reverse();
  const calls = await Promise.all(files.slice(0, 100).map(async (file) => JSON.parse(await readFile(path.join(CALLS_DIR, file), "utf8")) as CallState));
  return calls.map(({ call_id, market, started_at, outcome, escalated }) => ({ call_id, market, started_at, outcome, escalated }));
}

export async function readStoredCall(callId: string): Promise<CallState | null> {
  if (!/^call_[\w-]+$/.test(callId)) return null;
  try {
    return JSON.parse(await readFile(path.join(CALLS_DIR, `${callId}.json`), "utf8"));
  } catch {
    return null;
  }
}
