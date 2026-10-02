import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { hashedReference, redactPii } from "../kb/pii";
import { log } from "../log";
import type { CallState } from "./types";

const LEADS_DIR = path.resolve("runtime/leads");

export interface LeadRecord {
  lead_ref: string;
  call_id: string;
  market: string;
  created_at: string;
  intent: string;
  qualification_status: string;
  next_action: string;
  reasons: string[];
  rule_sources: string[];
  captured: Record<string, unknown>;
  skipped_fields: string[];
  required_followup: string;
  agent_summary: string;
  escalated: boolean;
  retrieved_chunk_ids: string[];
  details?: Record<string, unknown>;
}

const FOLLOWUP: Record<string, string> = {
  send_written_quote: "Send written quote within 15 minutes; advisor confirms final premium",
  underwriter_callback: "Underwriter callback within 2 working days to review declared condition",
  specialist_callback_senior_plan: "Specialist advisor callback for senior citizen plan",
  advisor_callback_to_complete: "Advisor callback within 2 working days to collect missing fields",
  warm_transfer_senior_advisor: "Senior advisor picks up the transferred call now",
  callback_next_working_day: "Callback next working day (outside desk hours)",
  mark_number_do_not_call: "Mark number do-not-call; no further sales calls",
};

function summarise(state: CallState): string {
  const captured = Object.entries(state.slots).map(([name, slot]) => `${name}=${JSON.stringify(slot.value)}`).join(", ");
  const questions = state.turns.filter((turn) => turn.intent?.includes("question")).length;
  const objections = state.turns.flatMap((turn) => (turn.intent ?? "").split(",").filter((intent) => intent.startsWith("objection:")));
  return [
    `Outcome ${state.outcome?.status ?? "none"} after ${state.turns.filter((turn) => turn.speaker === "customer").length} customer turns.`,
    captured && `Captured: ${captured}.`,
    state.skipped.length ? `Customer could not give: ${state.skipped.join(", ")}.` : "",
    questions ? `${questions} knowledge-base question(s), ${state.unanswered_questions} unanswered.` : "",
    objections.length ? `Objections: ${objections.map((objection) => objection.slice(10)).join(", ")}.` : "",
  ].filter(Boolean).join(" ");
}

/** The optional business action: a mock CRM lead written as JSON, plus an escalation webhook. */
export async function recordLead(state: CallState): Promise<LeadRecord> {
  const outcome = state.outcome!;
  const lead: LeadRecord = {
    // No phone number in this demo, so the reference is keyed on the call;
    // with a real dialler this would be hashedReference(caller_number).
    lead_ref: hashedReference(state.call_id),
    call_id: state.call_id,
    market: state.market,
    created_at: new Date().toISOString(),
    intent: state.market === "in_health" ? "health_insurance_enquiry" : "payment_reminder",
    qualification_status: outcome.status,
    next_action: outcome.next_action,
    reasons: outcome.reasons,
    rule_sources: outcome.rule_sources,
    captured: Object.fromEntries(Object.entries(state.slots).map(([name, slot]) => [name, slot.value])),
    skipped_fields: state.skipped,
    required_followup: FOLLOWUP[outcome.next_action] ?? outcome.next_action.replace(/_/g, " "),
    agent_summary: redactPii(summarise(state)).text,
    escalated: state.escalated,
    retrieved_chunk_ids: [...new Set(state.turns.flatMap((turn) => turn.retrieval?.chunk_ids ?? []))],
    details: outcome.details,
  };
  await mkdir(LEADS_DIR, { recursive: true });
  await writeFile(path.join(LEADS_DIR, `${state.call_id}.json`), JSON.stringify(lead, null, 2));
  if (state.escalated) await notifyEscalation(lead);
  return lead;
}

async function notifyEscalation(lead: LeadRecord): Promise<void> {
  const url = process.env.ESCALATION_WEBHOOK_URL;
  if (!url) {
    log("escalation.webhook_skipped", { call_id: lead.call_id, reason: "ESCALATION_WEBHOOK_URL not set" });
    return;
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "escalation", lead }),
      signal: AbortSignal.timeout(3000),
    });
    log("escalation.webhook_sent", { call_id: lead.call_id, status: response.status });
  } catch (error) {
    // The transfer itself does not depend on the webhook; it is a notification.
    log("escalation.webhook_failed", { call_id: lead.call_id, error: (error as Error).message });
  }
}
