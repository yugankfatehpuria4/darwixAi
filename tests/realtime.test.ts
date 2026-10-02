import { describe, expect, it } from "vitest";
import { parseDeepgramResult, TimelineAsr, type TranscriptSegment } from "../src/realtime/asr";
import { NudgeEngine } from "../src/realtime/nudges";
import { replayAtRealTime } from "../src/realtime/replay";
import { detectSignals, newContext } from "../src/realtime/signals";

const segment = (speaker: "agent" | "customer", text: string, overrides: Partial<TranscriptSegment> = {}): TranscriptSegment => ({
  index: 0,
  speaker,
  text,
  confidence: 0.92,
  start_ms: 0,
  end_ms: 1000,
  interrupted_previous: false,
  t_audio_received: Date.now(),
  t_transcribed: Date.now(),
  ...overrides,
});

describe("real-time replay", () => {
  it("releases audio no faster than real time, in 250 ms chunks", async () => {
    const oneSecond = { sampleRate: 16000, samples: new Int16Array(16000), durationMs: 1000 };
    const started = Date.now();
    const chunks = [];
    for await (const chunk of replayAtRealTime(oneSecond)) chunks.push(chunk);
    expect(chunks).toHaveLength(4);
    for (const chunk of chunks) expect(chunk.received_at - started).toBeGreaterThanOrEqual(chunk.end_ms - 5);
    expect(Date.now() - started).toBeGreaterThanOrEqual(995);
  });

  it("simulated ASR never finalises a turn before the audio clock reaches its end", () => {
    const finals: TranscriptSegment[] = [];
    const asr = new TimelineAsr([{ index: 0, speaker: "customer", start_ms: 0, end_ms: 600, text: "hello there" }], { onPartial: () => {}, onFinal: (final) => finals.push(final) });
    asr.feed({ index: 0, start_ms: 0, end_ms: 250, pcm: new Int16Array(0), received_at: 1 });
    asr.feed({ index: 1, start_ms: 250, end_ms: 500, pcm: new Int16Array(0), received_at: 2 });
    expect(finals).toHaveLength(0);
    asr.feed({ index: 2, start_ms: 500, end_ms: 750, pcm: new Int16Array(0), received_at: 3 });
    expect(finals).toHaveLength(1);
    expect(finals[0].t_audio_received).toBe(3);
  });

  it("parses Deepgram streaming results (shape only; the live service is untested)", () => {
    const sentAt = [{ end_ms: 1250, at: 111 }, { end_ms: 1500, at: 222 }];
    const message = {
      type: "Results",
      is_final: true,
      start: 0.2,
      duration: 1.1,
      channel: { alternatives: [{ transcript: "too expensive for us", confidence: 0.87, words: [{ word: "too", start: 0.2, end: 0.4, speaker: 1 }] }] },
    };
    const parsed = parseDeepgramResult(message, 4, sentAt);
    expect(parsed && "final" in parsed && parsed.final).toMatchObject({ index: 4, speaker: "customer", confidence: 0.87, end_ms: 1300, t_audio_received: 222 });
    expect(parseDeepgramResult({ ...message, is_final: false }, 4, sentAt)).toMatchObject({ partial: { text: "too expensive for us" } });
    expect(parseDeepgramResult({ type: "Metadata" }, 0, sentAt)).toBeNull();
  });
});

describe("signal detectors", () => {
  it("flags personal questions asked before the recording notice, and clears once given", () => {
    const context = newContext("in_health");
    expect(detectSignals(segment("agent", "So who do you want to cover, and what is your age?"), context).map((s) => s.topic)).toContain("compliance:recording_disclosure");
    detectSignals(segment("agent", "This call is recorded for quality and training purposes."), context);
    expect(detectSignals(segment("agent", "Which city are you in?"), context)).toHaveLength(0);
  });

  it("treats a vague amount as conversation, not a price quote", () => {
    const context = newContext("in_health");
    context.recording_disclosed = true;
    expect(detectSignals(segment("agent", "One hospital stay can cost several lakh rupees, or pay with monthly auto-debit."), context)).toHaveLength(0);
    expect(detectSignals(segment("agent", "It would be around fifteen thousand rupees a year."), context).map((s) => s.topic)).toEqual(["compliance:price_before_disclosure"]);
  });

  it("does not raise a cross-sell when the customer says the need is already covered", () => {
    const context = newContext("in_health");
    expect(detectSignals(segment("customer", "My parents already have their own policy actually"), context)).toHaveLength(0);
    expect(detectSignals(segment("customer", "My parents are 61 and 64 and they don't have any insurance"), context)[0]).toMatchObject({ topic: "opportunity:parents_cover", detector_confidence: 0.85 });
  });

  it("catches promises and threats in agent speech", () => {
    expect(detectSignals(segment("agent", "Don't worry, your claim will definitely be approved"), newContext("in_health")).map((s) => s.topic)).toContain("risk:prohibited_promise");
    const context = newContext("id_finance");
    context.recording_disclosed = true;
    expect(detectSignals(segment("agent", "kalau tidak motor akan kami tarik"), context).map((s) => s.topic)).toContain("risk:threat");
  });

  it("raises frustration only when it is rising, not on residual score", () => {
    const context = newContext("id_finance");
    const first = detectSignals(segment("customer", "Saya kan sudah bilang, kenapa sih nelpon terus, capek saya.", { interrupted_previous: true }), context);
    expect(first.map((s) => s.topic)).toContain("customer:frustration");
    expect(detectSignals(segment("customer", "Iya, baik."), context).map((s) => s.topic)).not.toContain("customer:frustration");
  });
});

describe("nudge control", () => {
  const calm = { hardship: false, frustration: 0 };

  it("suppresses signals whose confidence, after the recogniser's own, is too low", () => {
    const engine = new NudgeEngine("in_health");
    const [signal] = detectSignals(segment("customer", "me and may be my parent check", { confidence: 0.41 }), newContext("in_health"));
    const decision = engine.consider(signal, calm, Date.now());
    expect(decision.delivered).toBe(false);
    expect(!decision.delivered && decision.reason).toMatch(/low_confidence/);
  });

  it("sends one nudge per topic and suppresses repeats", () => {
    const engine = new NudgeEngine("in_health");
    const context = newContext("in_health");
    const [first] = detectSignals(segment("agent", "what is your age?"), context);
    const [second] = detectSignals(segment("agent", "and which city?"), context);
    expect(engine.consider(first, calm, Date.now()).delivered).toBe(true);
    expect(engine.consider(second, calm, Date.now())).toMatchObject({ delivered: false, reason: expect.stringContaining("duplicate") });
  });

  it("caps advisory nudges at three a minute but never holds back compliance", () => {
    const engine = new NudgeEngine("in_health");
    const advice = ["This is too expensive for us", "how do I sign up", "call me back tomorrow", "my parents don't have any insurance"];
    const results = advice.map((text, index) => {
      const [signal] = detectSignals(segment("customer", text, { index }), newContext("in_health"));
      return engine.consider(signal, calm, Date.now());
    });
    expect(results.slice(0, 3).every((result) => result.delivered)).toBe(true);
    expect(results[3]).toMatchObject({ delivered: false, reason: expect.stringContaining("rate_limited") });
    const [compliance] = detectSignals(segment("agent", "what is your age?"), newContext("in_health"));
    expect(engine.consider(compliance, calm, Date.now()).delivered).toBe(true);
  });

  it("holds back sales nudges while the customer is in hardship", () => {
    const engine = new NudgeEngine("id_finance");
    const [signal] = detectSignals(segment("customer", "Anak saya mau ambil motor kedua"), newContext("id_finance"));
    expect(engine.consider(signal, { hardship: true, frustration: 0 }, Date.now())).toMatchObject({ delivered: false, reason: expect.stringContaining("hardship") });
  });

  it("grounds a cross-sell nudge in the knowledge base and resolves it when the agent acts", () => {
    const engine = new NudgeEngine("in_health");
    const [signal] = detectSignals(segment("customer", "my parents don't have any insurance"), newContext("in_health"));
    const decision = engine.consider(signal, calm, Date.now());
    expect(decision.delivered && decision.nudge.citation?.record_id).toMatch(/^kb_in_health_/);
    expect(engine.resolveFrom(segment("agent", "Your parents can be added to Family Shield"))).toHaveLength(1);
  });
});
