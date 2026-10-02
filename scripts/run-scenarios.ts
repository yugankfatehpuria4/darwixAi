import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Market } from "../src/kb/types";
import { createCall, redactedCopy, takeTurn } from "../src/agent/session";
import { warmIndex } from "../src/kb/search";
import type { CallState, TurnInput } from "../src/agent/types";

interface Scenario {
  id: string;
  market: Market;
  title: string;
  covers: string[];
  call_time: string;
  turns: TurnInput[];
  expect: {
    status: string;
    escalated?: boolean;
    next_action?: string;
    intents_include?: string[];
    retrieval_turns_min?: number;
    unanswered_min?: number;
    register_final?: string;
    reply_contains?: string[];
    reply_not_contains?: string[];
  };
}

const only = process.argv[2];
const { scenarios }: { scenarios: Scenario[] } = JSON.parse(await readFile("data/scenarios/calls.json", "utf8"));
const selected = scenarios.filter((scenario) => !only || scenario.id.startsWith(only));

function check(scenario: Scenario, state: CallState): string[] {
  const failures: string[] = [];
  const expect = scenario.expect;
  const intents = state.turns.flatMap((turn) => (turn.intent ?? "").split(",")).filter(Boolean);
  const botText = state.turns.filter((turn) => turn.speaker === "bot").map((turn) => turn.text).join(" ");
  const retrievalTurns = state.turns.filter((turn) => turn.speaker === "bot" && turn.retrieval).length;
  if (state.outcome?.status !== expect.status) failures.push(`status ${state.outcome?.status ?? "none"} != ${expect.status}`);
  if (expect.escalated !== undefined && state.escalated !== expect.escalated) failures.push(`escalated ${state.escalated} != ${expect.escalated}`);
  if (expect.next_action && state.outcome?.next_action !== expect.next_action) failures.push(`next_action ${state.outcome?.next_action} != ${expect.next_action}`);
  for (const intent of expect.intents_include ?? []) if (!intents.includes(intent)) failures.push(`missing intent ${intent}`);
  if (expect.retrieval_turns_min && retrievalTurns < expect.retrieval_turns_min) failures.push(`only ${retrievalTurns} turns used the KB`);
  if (expect.unanswered_min && state.unanswered_questions < expect.unanswered_min) failures.push(`unanswered ${state.unanswered_questions} < ${expect.unanswered_min}`);
  if (expect.register_final && state.register !== expect.register_final) failures.push(`register ${state.register} != ${expect.register_final}`);
  for (const phrase of expect.reply_contains ?? []) if (!botText.includes(phrase)) failures.push(`bot never said "${phrase}"`);
  for (const phrase of expect.reply_not_contains ?? []) if (botText.toLowerCase().includes(phrase.toLowerCase())) failures.push(`bot said "${phrase}"`);
  if (state.stage !== "ended") failures.push("call did not end");
  return failures;
}

function transcriptMarkdown(scenario: Scenario, state: CallState, failures: string[]): string {
  const stored = redactedCopy(state);
  const lines = [
    `# ${scenario.id}: ${scenario.title}`,
    "",
    `Market \`${scenario.market}\` | call \`${state.call_id}\` | clock ${scenario.call_time} | text injected at the ASR output (no audio recognition in this run)`,
    "",
    `Covers: ${scenario.covers.join("; ")}`,
    "",
    "| # | Speaker | Text | Notes |",
    "|---|---|---|---|",
  ];
  for (const turn of stored.turns) {
    const notes: string[] = [];
    if (turn.intent) notes.push(`intent: ${turn.intent}`);
    if (turn.event) notes.push(`event: ${turn.event}`);
    if (turn.asr_confidence !== undefined) notes.push(`asr_confidence ${turn.asr_confidence}`);
    if (turn.register && turn.speaker === "bot") notes.push(`register ${turn.register}`);
    if (turn.retrieval) {
      const retrieval = turn.retrieval;
      notes.push(
        retrieval.answerable
          ? `KB ${retrieval.answer_mode}, chunks ${retrieval.chunk_ids.map((id) => `\`${id}\``).join(", ")}, confidence ${retrieval.confidence}`
          : `KB refused (${retrieval.reason}); candidates ${retrieval.chunk_ids.slice(0, 2).map((id) => `\`${id}\``).join(", ")}`,
      );
    }
    const text = turn.text || (turn.event ? `(${turn.event})` : "");
    lines.push(`| ${turn.index} | ${turn.speaker} | ${text.replace(/\|/g, "/")} | ${notes.join("; ")} |`);
  }
  lines.push("", "## Outcome", "", "```json", JSON.stringify(state.outcome, null, 2), "```", "");
  const citations = [...new Set(stored.turns.flatMap((turn) => (turn.retrieval?.answerable ? turn.retrieval.citations.slice(0, 1) : [])))];
  if (citations.length) lines.push("## Citations used", "", ...citations.map((citation) => `- ${citation}`), "");
  lines.push("## Check", "", failures.length ? `FAIL: ${failures.join("; ")}` : "PASS: every expectation in data/scenarios/calls.json met.", "");
  return lines.join("\n");
}

// Index build is a one-off at process start (the server does it at boot);
// keep it out of the per-turn retrieval numbers.
console.log(`index built in ${warmIndex()} ms`);
const results: Array<{ scenario: Scenario; state: CallState; failures: string[] }> = [];
for (const scenario of selected) {
  const clock = new Date(scenario.call_time);
  const { state } = await createCall(scenario.market, clock);
  for (const [index, input] of scenario.turns.entries()) {
    if (state.stage === "ended") break;
    // Each turn is stamped a few seconds later, so desk-hour checks and
    // transcripts see a plausible timeline.
    await takeTurn(state.call_id, input, new Date(clock.getTime() + (index + 1) * 12_000));
  }
  const failures = check(scenario, state);
  results.push({ scenario, state, failures });
  const folder = scenario.id.startsWith("q1") ? "evidence/q1/transcripts" : "evidence/q3/transcripts";
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, `${scenario.id}.md`), transcriptMarkdown(scenario, state, failures));
  await writeFile(path.join(folder, `${scenario.id}.json`), JSON.stringify(redactedCopy(state), null, 2));
  console.log(`${failures.length ? "FAIL" : "PASS"}  ${scenario.id.padEnd(34)} ${state.outcome?.status}${failures.length ? `  <- ${failures.join("; ")}` : ""}`);
}

const passed = results.filter((result) => !result.failures.length).length;
console.log(`\n${passed}/${results.length} scenarios passed`);
if (!only) {
  const table = [
    "# Scripted call results",
    "",
    `Generated by \`npm run scenarios\`. ${passed}/${results.length} passed. Customer turns are text injected at the ASR output; see each transcript for the turn-by-turn retrieval annotations.`,
    "",
    "| Scenario | Market | Covers | Expected | Actual | Escalated | KB turns | Result |",
    "|---|---|---|---|---|---|---|---|",
    ...results.map(({ scenario, state, failures }) =>
      `| [${scenario.id}](${scenario.id.startsWith("q1") ? "../q1" : "../q3"}/transcripts/${scenario.id}.md) | ${scenario.market} | ${scenario.covers.join("; ")} | ${scenario.expect.status} | ${state.outcome?.status} | ${state.escalated} | ${state.turns.filter((turn) => turn.retrieval).length} | ${failures.length ? `FAIL: ${failures.join("; ")}` : "PASS"} |`,
    ),
    "",
  ].join("\n");
  await mkdir("evidence/q1", { recursive: true });
  await writeFile("evidence/q1/scenario_results.md", table);
}
process.exitCode = passed === results.length ? 0 : 1;
