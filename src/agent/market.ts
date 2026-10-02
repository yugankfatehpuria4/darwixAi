import type { Market } from "../kb/types";
import type { CallState, Outcome, SlotValue } from "./types";

/** A line in every register the market supports, with {placeholders}. */
export type Line = Record<string, string>;

export interface SlotSpec {
  name: string;
  /** Key into MarketPack.lines for the question that asks for this slot. */
  prompt: string;
  required: boolean;
  /**
   * Reads the slot from an utterance. `asked` is true when this slot is the
   * question currently on the table; some values (a bare number, a city
   * name) are only trusted then.
   */
  extract(text: string, asked: boolean, state: CallState): SlotValue["value"] | undefined;
  /** Identity checks: a value that does not verify is not stored. */
  verify?(value: SlotValue["value"], state: CallState): boolean;
  /** How the value is read back when two answers conflict. */
  describe?(value: SlotValue["value"], register: string): string;
}

export interface ObjectionSpec {
  id: string;
  pattern: RegExp;
  /** Not this objection if this also matches (e.g. "no money" said together with "lost my job" is hardship). */
  unless?: RegExp;
  /** Search query used against the market's objection records. */
  query: string;
  /** Some objections end the call with a fixed next action. */
  ends_with?: { status: string; next_action: string; line: string };
}

export interface RegisterSpec {
  asr_locale: string;
  tts_locale: string;
  /** Given to the LLM so a grounded answer comes back in the caller's register. */
  llm_instruction: string;
}

export interface MarketPack {
  market: Market;
  company: string;
  registers: Record<string, RegisterSpec>;
  default_register: string;
  /** Picks the reply register from the customer's latest utterance. */
  detectRegister(text: string, current: string): string;
  lines: Record<string, Line>;
  slots: SlotSpec[];
  objections: ObjectionSpec[];
  patterns: {
    escalation: RegExp;
    do_not_call: RegExp;
    dont_know: RegExp;
    correction: RegExp;
  };
  max_unanswered_questions: number;
  /** Generic forms of address in KB wording, mapped to the vars() key that holds this customer's. */
  address_terms?: Record<string, string>;
  /** Loads the customer account (reminder flows) and lists PII to mask on disk. */
  setup(state: CallState): void;
  /** Placeholder values available to every line. */
  vars(state: CallState): Record<string, string>;
  /** Line spoken right after a slot is filled, e.g. the reminder once identity is verified. */
  afterSlot?(slot: string, state: CallState): string | null;
  /** What happens when the opening yes/no question is answered "no". */
  declined: { status: string; next_action: string; line: string };
  /** Business decision once the flow is complete. Deterministic, never the LLM. */
  decide(state: CallState): Outcome;
  /** Line keys spoken for a decided outcome. */
  outcomeLine(outcome: Outcome, state: CallState): string;
  escalationOutcome(state: CallState, reason: string): { outcome: Outcome; line: string };
}
