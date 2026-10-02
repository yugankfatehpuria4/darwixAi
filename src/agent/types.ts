import type { Market } from "../kb/types";

export type Speaker = "bot" | "customer";

export interface RetrievalTrace {
  query: string;
  answerable: boolean;
  reason: string;
  confidence: number;
  chunk_ids: string[];
  citations: string[];
  answer_mode: "llm" | "extractive" | "fallback";
  llm_error?: string;
}

export interface Turn {
  index: number;
  speaker: Speaker;
  text: string;
  at: string;
  register?: string;
  /** What the engine decided this customer turn was. */
  intent?: string;
  event?: "silence" | "asr_error";
  asr_confidence?: number;
  /** The caller started talking over the bot and the browser cut the bot's speech. */
  barged_in?: boolean;
  retrieval?: RetrievalTrace;
}

export interface SlotValue {
  value: string | number | boolean | string[] | null;
  heard: string;
  turn: number;
}

export interface Outcome {
  status: string;
  next_action: string;
  reasons: string[];
  rule_sources: string[];
  details?: Record<string, unknown>;
}

export interface TurnLatency {
  turn: number;
  /** Measured in the browser: end of speech to final transcript. Absent for text-injected turns. */
  asr_ms?: number;
  understand_ms: number;
  retrieval_ms?: number;
  llm_ms?: number;
  /** Measured in the browser: reply received to speech starting. */
  tts_start_ms?: number;
  server_total_ms: number;
}

export type Stage = "consent" | "collect" | "confirm_conflict" | "closing" | "ended";

export interface CallState {
  call_id: string;
  market: Market;
  started_at: string;
  today: string;
  stage: Stage;
  register: string;
  slots: Record<string, SlotValue>;
  skipped: string[];
  pending_conflict: { slot: string; previous: SlotValue; incoming: SlotValue } | null;
  unanswered_questions: number;
  consecutive_silence: number;
  consecutive_unclear: number;
  disclosures_given: string[];
  identity_attempts: number;
  outcome: Outcome | null;
  escalated: boolean;
  turns: Turn[];
  latencies: TurnLatency[];
  /** Values that must be masked when the transcript is written to disk. */
  known_pii: Array<{ value: string; label: string }>;
  account?: Record<string, string | number>;
}

export interface TurnInput {
  text?: string;
  event?: Turn["event"];
  asr_confidence?: number;
  barged_in?: boolean;
  client_timing?: { asr_ms?: number; tts_start_ms?: number };
}

export interface BotReply {
  text: string;
  register: string;
  /** BCP-47 tag the browser should use for speech synthesis. */
  tts_locale: string;
  asr_locale: string;
  ended: boolean;
  escalated: boolean;
  retrieval?: RetrievalTrace;
  outcome?: Outcome | null;
}
