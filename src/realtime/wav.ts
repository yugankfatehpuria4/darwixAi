import { readFile } from "node:fs/promises";

export interface Pcm {
  sampleRate: number;
  samples: Int16Array;
  durationMs: number;
}

/** 16-bit mono PCM WAV only; that is all the renderer and the demo produce. */
export async function readWav(path: string): Promise<Pcm> {
  const bytes = await readFile(path);
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`${path} is not a RIFF/WAVE file`);
  }
  let offset = 12;
  let sampleRate = 0;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    if (id === "fmt ") {
      const channels = bytes.readUInt16LE(offset + 10);
      const bits = bytes.readUInt16LE(offset + 22);
      sampleRate = bytes.readUInt32LE(offset + 12);
      if (channels !== 1 || bits !== 16) throw new Error(`${path}: expected 16-bit mono, got ${bits}-bit with ${channels} channels`);
    } else if (id === "data") {
      const pcmBytes = bytes.subarray(offset + 8, offset + 8 + size);
      const samples = new Int16Array(pcmBytes.buffer.slice(pcmBytes.byteOffset, pcmBytes.byteOffset + pcmBytes.byteLength));
      return { sampleRate, samples, durationMs: Math.round((samples.length / sampleRate) * 1000) };
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error(`${path}: no data chunk`);
}
