import { search } from "../kb/search";
import type { Market } from "../kb/types";
import type { TranscriptSegment } from "./asr";
import type { Priority, Signal } from "./signals";

// Signal confidence x recogniser confidence must reach this to become a
// nudge. Chosen from the sweep in evidence/q4/nudge_precision.md.
export const NUDGE_MIN_CONFIDENCE = 0.6;
// An agent can act on roughly one piece of advice every 20 s while still
// talking to the customer; more than three a minute and they stop reading.
// Compliance and risk nudges are mandatory: they bypass the limit and do not
// use up the agent's advice budget.
export const MAX_NUDGES_PER_MINUTE = 3;
// The same topic is not raised again within this window, even after the
// first nudge expired or was resolved.
export const TOPIC_COOLDOWN_MS = 90_000;

export interface Nudge {
  id: string;
  topic: string;
  priority: Priority;
  text: string;
  confidence: number;
  evidence: string;
  segment_index: number;
  citation: { record_id: string; citation: string; snippet: string } | null;
  created_at: number;
  expires_at: number;
  timings: {
    t_audio_received: number;
    t_transcribed: number;
    t_signal: number;
    kb_ms: number;
    t_ready: number;
  };
}

export type Decision =
  | { delivered: true; nudge: Nudge }
  | { delivered: false; topic: string; reason: string; confidence: number; segment_index: number };

interface State {
  nudge: Nudge;
  status: "active" | "resolved" | "expired";
}

const SNIPPET_WORDS = 40;

export class NudgeEngine {
  private nudges: State[] = [];
  private resolvers = new Map<string, RegExp | undefined>();
  private counter = 0;

  constructor(private readonly market: Market, private readonly minConfidence = NUDGE_MIN_CONFIDENCE) {}

  consider(signal: Signal, context: { hardship: boolean; frustration: number }, t_signal: number): Decision {
    const segment = signal.segment;
    const confidence = Number((signal.detector_confidence * segment.confidence).toFixed(3));
    const refuse = (reason: string): Decision => ({ delivered: false, topic: signal.topic, reason, confidence, segment_index: segment.index });

    if (confidence < this.minConfidence) return refuse(`low_confidence (${confidence} < ${this.minConfidence})`);
    if (signal.topic.startsWith("opportunity:") && (context.hardship || context.frustration >= 1.5)) {
      // Selling to someone who just said they lost their job, or who is
      // already angry, costs more trust than the sale is worth.
      return refuse(context.hardship ? "suppressed_by_context: customer in hardship" : "suppressed_by_context: customer frustrated");
    }
    const now = Date.now();
    const sameTopic = this.nudges.filter((entry) => entry.nudge.topic === signal.topic);
    if (sameTopic.some((entry) => entry.status === "active")) return refuse("duplicate: same topic still on screen");
    if (sameTopic.some((entry) => now - entry.nudge.created_at < TOPIC_COOLDOWN_MS)) return refuse(`cooldown: topic raised < ${TOPIC_COOLDOWN_MS / 1000}s ago`);
    const mandatory = (topic: string) => topic.startsWith("compliance:") || topic.startsWith("risk:");
    const lastMinute = this.nudges.filter((entry) => !mandatory(entry.nudge.topic) && now - entry.nudge.created_at < 60_000).length;
    if (!mandatory(signal.topic) && lastMinute >= MAX_NUDGES_PER_MINUTE) return refuse(`rate_limited: ${lastMinute} advisory nudges in the last minute`);

    const kbStarted = performance.now();
    let citation: Nudge["citation"] = null;
    if (signal.kb) {
      const grounding = search(signal.kb.query, { market: this.market, categories: signal.kb.categories, audience: signal.kb.audience, topK: 1 });
      const hit = grounding.hits[0];
      if (grounding.answerable && hit) {
        const quoted = hit.record.content.match(/(?:Say|Halimbawa|Contoh):\s*"([^"]+)"/)?.[1] ?? hit.record.content.replace(/^Q:.*\nA:\s*/, "");
        const words = quoted.split(/\s+/);
        citation = {
          record_id: hit.record.record_id,
          citation: hit.citation,
          snippet: words.slice(0, SNIPPET_WORDS).join(" ") + (words.length > SNIPPET_WORDS ? " ..." : ""),
        };
      } else if (signal.kb.requires_kb) {
        return refuse(`no_grounded_content: KB returned ${grounding.reason}`);
      }
    }
    const kbMs = Math.round((performance.now() - kbStarted) * 10) / 10;

    const nudge: Nudge = {
      id: `n${++this.counter}`,
      topic: signal.topic,
      priority: signal.priority,
      text: signal.nudge,
      confidence,
      evidence: signal.evidence,
      segment_index: segment.index,
      citation,
      created_at: now,
      expires_at: now + signal.ttl_ms,
      timings: { t_audio_received: segment.t_audio_received, t_transcribed: segment.t_transcribed, t_signal, kb_ms: kbMs, t_ready: Date.now() },
    };
    this.nudges.push({ nudge, status: "active" });
    this.resolvers.set(nudge.id, signal.resolved_by);
    return { delivered: true, nudge };
  }

  /** Agent speech that acts on a nudge clears it from the screen. */
  resolveFrom(segment: TranscriptSegment): Nudge[] {
    if (segment.speaker !== "agent") return [];
    const resolved: Nudge[] = [];
    for (const entry of this.nudges) {
      const resolver = this.resolvers.get(entry.nudge.id);
      if (entry.status === "active" && resolver?.test(segment.text)) {
        entry.status = "resolved";
        resolved.push(entry.nudge);
      }
    }
    return resolved;
  }

  expire(now = Date.now()): Nudge[] {
    const expired: Nudge[] = [];
    for (const entry of this.nudges) {
      if (entry.status === "active" && now >= entry.nudge.expires_at) {
        entry.status = "expired";
        expired.push(entry.nudge);
      }
    }
    return expired;
  }
}
