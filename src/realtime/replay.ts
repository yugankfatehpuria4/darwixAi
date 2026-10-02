import { setTimeout as sleep } from "node:timers/promises";
import type { Pcm } from "./wav";

export interface AudioChunk {
  index: number;
  /** Position of this chunk inside the recording. */
  start_ms: number;
  end_ms: number;
  pcm: Int16Array;
  /** Wall-clock time (epoch ms) at which the chunk was handed to the pipeline. */
  received_at: number;
}

// 250 ms is what telephony streaming APIs typically take per frame; smaller
// chunks add per-message overhead, larger ones add up to a chunk of latency
// before any audio reaches the recogniser.
export const CHUNK_MS = 250;

/**
 * Replays a recording as if it were arriving from a live call. Chunk n is
 * released only once n+1 chunks' worth of wall-clock time has passed since
 * the start, so a 60 s recording takes 60 s. Timing is drift-corrected
 * against the start time rather than sleeping a fixed amount per chunk.
 */
export async function* replayAtRealTime(audio: Pcm, options: { speed?: number; signal?: AbortSignal } = {}): AsyncGenerator<AudioChunk> {
  const speed = options.speed ?? 1;
  const samplesPerChunk = Math.round((audio.sampleRate * CHUNK_MS) / 1000);
  const started = Date.now();
  for (let index = 0; index * samplesPerChunk < audio.samples.length; index++) {
    const startSample = index * samplesPerChunk;
    const endSample = Math.min(audio.samples.length, startSample + samplesPerChunk);
    const endMs = Math.round((endSample / audio.sampleRate) * 1000);
    const due = started + endMs / speed;
    const wait = due - Date.now();
    if (wait > 0) await sleep(wait, undefined, { signal: options.signal });
    if (options.signal?.aborted) return;
    yield {
      index,
      start_ms: Math.round((startSample / audio.sampleRate) * 1000),
      end_ms: endMs,
      pcm: audio.samples.subarray(startSample, endSample),
      received_at: Date.now(),
    };
  }
}
