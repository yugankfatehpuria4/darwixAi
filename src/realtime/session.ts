import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { generateJson, llmConfigured } from "../agent/llm";
import { search } from "../kb/search";
import type { Market } from "../kb/types";
import { log } from "../log";
import { DeepgramAsr, TimelineAsr, type StreamingAsr, type TimelineTurn, type TranscriptSegment } from "./asr";
import { NudgeEngine, type Decision, type Nudge } from "./nudges";
import { replayAtRealTime } from "./replay";
import { detectSignals, newContext, sentimentOf, type CallContext } from "./signals";
import { readWav } from "./wav";

export const AUDIO_DIR = path.resolve("evidence/audio");
const NUDGE_LLM_TIMEOUT_MS = 800;
const DEEPGRAM_LANGUAGE: Record<Market, string> = { in_health: "en-IN", ph_life: "tl", id_finance: "id" };

export type RealtimeMessage =
  | { type: "started"; call: string; market: Market; asr: string; asr_measured: boolean; duration_ms: number | null }
  | { type: "audio"; position_ms: number }
  | { type: "partial"; index: number; speaker: string; text: string }
  | { type: "transcript"; segment: TranscriptSegment }
  | { type: "insight"; kind: "sentiment" | "topic"; segment_index: number; value: string | number }
  | { type: "nudge"; nudge: Nudge & { t_sent: number; llm_ms?: number; llm_error?: string } }
  | { type: "nudge_suppressed"; topic: string; reason: string; confidence: number; segment_index: number }
  | { type: "nudge_resolved"; id: string; topic: string; segment_index: number }
  | { type: "nudge_expired"; id: string; topic: string }
  | { type: "done"; summary: { segments: number; delivered: number; suppressed: number; resolved: number } }
  | { type: "error"; message: string };

export interface RecordingInfo {
  name: string;
  market: Market;
  duration_ms: number;
  noisy: boolean;
}

export async function listRecordings(): Promise<RecordingInfo[]> {
  const files = (await readdir(AUDIO_DIR).catch(() => [])).filter((file) => file.endsWith(".timeline.json"));
  const recordings = await Promise.all(
    files.map(async (file) => {
      const timeline = JSON.parse(await readFile(path.join(AUDIO_DIR, file), "utf8"));
      const hasWav = await readFile(path.join(AUDIO_DIR, `${timeline.call}.wav`)).then(() => true, () => false);
      return hasWav ? { name: timeline.call, market: timeline.market, duration_ms: timeline.duration_ms, noisy: timeline.noise_snr_db != null } : null;
    }),
  );
  return recordings.filter((recording): recording is RecordingInfo => recording !== null).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * One call being analysed while it happens: audio chunks in, transcript
 * segments out of the recogniser, signals and nudges out to the agent's
 * screen. The same object serves a replayed recording and a live browser
 * call (where the browser does the recognition and sends segments).
 */
export class RealtimeCall {
  private context: CallContext;
  private engine: NudgeEngine;
  private lastTopic: string | null = null;
  private counts = { segments: 0, delivered: 0, suppressed: 0, resolved: 0 };
  private pending: Promise<void> = Promise.resolve();

  constructor(readonly market: Market, private readonly send: (message: RealtimeMessage) => void, minConfidence?: number) {
    this.context = newContext(market);
    this.engine = new NudgeEngine(market, minConfidence);
  }

  async replay(name: string, options: { speed?: number; signal?: AbortSignal } = {}): Promise<void> {
    if (!/^[\w-]+$/.test(name)) throw new Error(`Bad recording name ${name}`);
    const timeline = JSON.parse(await readFile(path.join(AUDIO_DIR, `${name}.timeline.json`), "utf8")) as { market: Market; turns: TimelineTurn[]; duration_ms: number };
    const audio = await readWav(path.join(AUDIO_DIR, `${name}.wav`));
    const callbacks = {
      onPartial: (partial: { index: number; speaker: string; text: string }) => this.send({ type: "partial", ...partial }),
      onFinal: (segment: TranscriptSegment) => this.enqueue(segment),
    };
    const useDeepgram = process.env.ASR_MODE === "deepgram" && Boolean(process.env.DEEPGRAM_API_KEY);
    const asr: StreamingAsr = useDeepgram ? new DeepgramAsr(DEEPGRAM_LANGUAGE[this.market], audio.sampleRate, callbacks) : new TimelineAsr(timeline.turns, callbacks);
    this.send({ type: "started", call: name, market: this.market, asr: asr.name, asr_measured: asr.measured, duration_ms: audio.durationMs });
    log("realtime.replay_started", { recording: name, market: this.market, asr: asr.name, speed: options.speed ?? 1 });

    for await (const chunk of replayAtRealTime(audio, options)) {
      asr.feed(chunk);
      if (chunk.index % 4 === 3) this.send({ type: "audio", position_ms: chunk.end_ms });
      for (const nudge of this.engine.expire()) this.send({ type: "nudge_expired", id: nudge.id, topic: nudge.topic });
    }
    await asr.close();
    await this.pending;
    this.send({ type: "done", summary: this.counts });
  }

  /** Live mode: the browser recognised the speech and sends the final segment. */
  ingest(segment: Omit<TranscriptSegment, "t_transcribed" | "t_audio_received" | "index"> & { asr_ms?: number }): void {
    const now = Date.now();
    this.enqueue({
      ...segment,
      index: this.counts.segments,
      // The browser's recognition time happened before we saw the text; it
      // is reported by the page and added back so end-to-end is honest.
      t_audio_received: now - (segment.asr_ms ?? 0),
      t_transcribed: now,
    });
  }

  // Segments are processed strictly in order even if one waits on the LLM.
  private enqueue(segment: TranscriptSegment): void {
    this.pending = this.pending.then(() => this.process(segment)).catch((error) => {
      log("realtime.segment_failed", { market: this.market, segment: segment.index, error: (error as Error).message });
      this.send({ type: "error", message: `Segment ${segment.index} failed: ${(error as Error).message}` });
    });
  }

  private async process(segment: TranscriptSegment): Promise<void> {
    this.counts.segments++;
    this.send({ type: "transcript", segment });

    for (const nudge of this.engine.resolveFrom(segment)) {
      this.counts.resolved++;
      this.send({ type: "nudge_resolved", id: nudge.id, topic: nudge.topic, segment_index: segment.index });
    }
    if (segment.speaker === "customer") {
      this.send({ type: "insight", kind: "sentiment", segment_index: segment.index, value: sentimentOf(segment.text) });
      const topic = search(segment.text, { market: this.market, audience: "customer", topK: 1 });
      const category = topic.answerable ? topic.hits[0].record.category : null;
      if (category && category !== this.lastTopic) {
        this.lastTopic = category;
        this.send({ type: "insight", kind: "topic", segment_index: segment.index, value: category });
      }
    }

    const signals = detectSignals(segment, this.context);
    const tSignal = Date.now();
    for (const signal of signals) {
      const decision: Decision = this.engine.consider(signal, this.context, tSignal);
      if (!decision.delivered) {
        this.counts.suppressed++;
        this.send({ type: "nudge_suppressed", topic: decision.topic, reason: decision.reason, confidence: decision.confidence, segment_index: decision.segment_index });
        continue;
      }
      const nudge: Nudge & { llm_ms?: number; llm_error?: string } = decision.nudge;
      if (process.env.NUDGE_LLM === "on" && llmConfigured()) await this.rephrase(nudge);
      this.counts.delivered++;
      this.send({ type: "nudge", nudge: { ...nudge, t_sent: Date.now() } });
      log("realtime.nudge", { market: this.market, nudge_id: nudge.id, topic: nudge.topic, confidence: nudge.confidence, kb: nudge.citation?.record_id, segment: segment.index });
    }
  }

  /**
   * Optional: shorten the template with the LLM. Off by default; the
   * template is already actionable and the LLM would sit on the critical
   * path. On timeout or a bad answer the template stands.
   */
  private async rephrase(nudge: Nudge & { llm_ms?: number; llm_error?: string }): Promise<void> {
    const rephrased = await generateJson(
      'Rewrite this note for a call-centre agent in at most 18 words. Keep every fact; add none. Return JSON {"text": string}.',
      `Note: ${nudge.text}\nApproved content: ${nudge.citation?.snippet ?? "none"}`,
      NUDGE_LLM_TIMEOUT_MS,
    );
    nudge.llm_ms = rephrased.ms;
    if (!rephrased.ok) {
      nudge.llm_error = rephrased.error;
      return;
    }
    try {
      const text = JSON.parse(rephrased.text).text;
      if (typeof text === "string" && text.trim()) nudge.text = text.trim();
    } catch {
      nudge.llm_error = "llm_output_not_json";
    }
  }
}
