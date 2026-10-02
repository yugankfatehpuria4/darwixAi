import type { AudioChunk } from "./replay";

export type Speaker = "agent" | "customer";

export interface TranscriptSegment {
  index: number;
  speaker: Speaker;
  text: string;
  confidence: number;
  start_ms: number;
  end_ms: number;
  interrupted_previous: boolean;
  /** Wall clock (epoch ms) when the chunk holding the segment's last audio arrived. */
  t_audio_received: number;
  /** Wall clock when the recogniser produced the final transcript. */
  t_transcribed: number;
}

export interface PartialTranscript {
  index: number;
  speaker: Speaker;
  text: string;
}

export interface StreamingAsr {
  readonly name: string;
  /** True when the transcript comes from a real recogniser, false for the timeline replay. */
  readonly measured: boolean;
  feed(chunk: AudioChunk): void;
  close(): Promise<void>;
}

export interface AsrCallbacks {
  onPartial(partial: PartialTranscript): void;
  onFinal(segment: TranscriptSegment): void;
}

export interface TimelineTurn {
  index: number;
  speaker: Speaker;
  start_ms: number;
  end_ms: number;
  text: string;
  asr_confidence?: number | null;
  interrupted_previous?: boolean;
}

/**
 * SIMULATION. Stands in for a diarised streaming recogniser by releasing the
 * known transcript of each turn as the replayed audio reaches it: partial
 * words while the turn is playing, the final segment on the first chunk at
 * or after the turn's end. It never looks ahead of the audio clock, so
 * everything downstream sees transcripts no earlier than a real recogniser
 * could produce them. What it cannot show is real recognition latency or
 * errors; its "ASR latency" is only the chunk boundary wait.
 */
export class TimelineAsr implements StreamingAsr {
  readonly name = "simulated (timeline replay)";
  readonly measured = false;
  private emitted = new Set<number>();
  private lastPartialWords = new Map<number, number>();

  constructor(private readonly turns: TimelineTurn[], private readonly callbacks: AsrCallbacks) {}

  feed(chunk: AudioChunk): void {
    for (const turn of this.turns) {
      if (this.emitted.has(turn.index) || !turn.text) continue;
      if (turn.end_ms <= chunk.end_ms) {
        this.emitted.add(turn.index);
        this.callbacks.onFinal({
          index: turn.index,
          speaker: turn.speaker,
          text: turn.text,
          // Turns without an authored confidence were spoken clearly.
          confidence: turn.asr_confidence ?? 0.92,
          start_ms: turn.start_ms,
          end_ms: turn.end_ms,
          interrupted_previous: Boolean(turn.interrupted_previous),
          t_audio_received: chunk.received_at,
          t_transcribed: Date.now(),
        });
      } else if (turn.start_ms < chunk.end_ms) {
        const words = turn.text.split(/\s+/);
        const heard = Math.max(1, Math.floor((words.length * (chunk.end_ms - turn.start_ms)) / (turn.end_ms - turn.start_ms)));
        if (heard !== this.lastPartialWords.get(turn.index)) {
          this.lastPartialWords.set(turn.index, heard);
          this.callbacks.onPartial({ index: turn.index, speaker: turn.speaker, text: words.slice(0, heard).join(" ") });
        }
      }
    }
  }

  async close(): Promise<void> {}
}

interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  speaker?: number;
}

export interface DeepgramMessage {
  type?: string;
  is_final?: boolean;
  start?: number;
  duration?: number;
  channel?: { alternatives?: Array<{ transcript: string; confidence: number; words?: DeepgramWord[] }> };
}

/** Turns one Deepgram streaming message into a partial or final segment (or nothing). */
export function parseDeepgramResult(
  message: DeepgramMessage,
  index: number,
  sentAt: Array<{ end_ms: number; at: number }>,
): { partial: PartialTranscript } | { final: TranscriptSegment } | null {
  const alternative = message.channel?.alternatives?.[0];
  if (message.type !== "Results" || !alternative?.transcript) return null;
  const speakerId = alternative.words?.[0]?.speaker ?? 0;
  const speaker: Speaker = speakerId === 0 ? "agent" : "customer";
  if (!message.is_final) return { partial: { index, speaker, text: alternative.transcript } };
  const startMs = Math.round((message.start ?? 0) * 1000);
  const endMs = Math.round(((message.start ?? 0) + (message.duration ?? 0)) * 1000);
  // Audio "received" = when the chunk carrying the segment's last sample was sent.
  const audioArrival = sentAt.find((sent) => sent.end_ms >= endMs)?.at ?? Date.now();
  return {
    final: {
      index,
      speaker,
      text: alternative.transcript,
      confidence: alternative.confidence,
      start_ms: startMs,
      end_ms: endMs,
      interrupted_previous: false,
      t_audio_received: audioArrival,
      t_transcribed: Date.now(),
    },
  };
}

/**
 * UNTESTED against the live service: the sandbox this was built in cannot
 * reach api.deepgram.com. The message parsing is unit-tested on a recorded
 * response shape. Streams raw 16 kHz PCM, asks for interim results and
 * diarisation, and maps Deepgram's speaker 0 to the agent (outbound calls:
 * the agent speaks first).
 */
export class DeepgramAsr implements StreamingAsr {
  readonly name = "deepgram (live streaming)";
  readonly measured = true;
  private socket: WebSocket;
  private open: Promise<void>;
  private sentAt: Array<{ end_ms: number; at: number }> = [];
  private segments = 0;

  constructor(language: string, sampleRate: number, private readonly callbacks: AsrCallbacks) {
    const params = new URLSearchParams({
      encoding: "linear16",
      sample_rate: String(sampleRate),
      channels: "1",
      language,
      model: process.env.DEEPGRAM_MODEL || "nova-3",
      interim_results: "true",
      diarize: "true",
      punctuate: "true",
    });
    // The key travels as a WebSocket subprotocol, which is Deepgram's
    // documented browser-compatible auth; it never appears in the URL.
    this.socket = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, ["token", process.env.DEEPGRAM_API_KEY!]);
    this.open = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", () => resolve(), { once: true });
      this.socket.addEventListener("error", () => reject(new Error("Deepgram connection failed")), { once: true });
    });
    this.socket.addEventListener("message", (event) => this.handle(JSON.parse(String(event.data))));
  }

  feed(chunk: AudioChunk): void {
    this.sentAt.push({ end_ms: chunk.end_ms, at: chunk.received_at });
    // Copy: the chunk is a view into the whole recording's buffer.
    const bytes = new Uint8Array(chunk.pcm.byteLength);
    bytes.set(new Uint8Array(chunk.pcm.buffer, chunk.pcm.byteOffset, chunk.pcm.byteLength));
    void this.open.then(() => this.socket.send(bytes));
  }

  handle(message: DeepgramMessage): void {
    const parsed = parseDeepgramResult(message, this.segments, this.sentAt);
    if (!parsed) return;
    if ("final" in parsed) {
      this.segments++;
      this.callbacks.onFinal(parsed.final);
    } else {
      this.callbacks.onPartial(parsed.partial);
    }
  }

  async close(): Promise<void> {
    await this.open.catch(() => undefined);
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: "CloseStream" }));
    this.socket.close();
  }
}
