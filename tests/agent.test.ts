import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import healthRules from "../config/health-rules.json" with { type: "json" };
import idRules from "../config/id-rules.json" with { type: "json" };
import phRules from "../config/ph-rules.json" with { type: "json" };
import { answerQuestion, checkLlmAnswer, extractiveAnswer } from "../src/agent/answer";
import { handleTurn, startCall } from "../src/agent/dialogue";
import { indonesianDate, rupiahInWords, tagalogDate } from "../src/agent/locale";
import { healthPack, indicativePremium } from "../src/agent/markets/health";
import { idFinancePack, parseBirthDate } from "../src/agent/markets/id-finance";
import { phLifePack } from "../src/agent/markets/ph-life";
import { looksLikeQuestion, numbersIn, resolvePromiseDate, yesNo } from "../src/agent/parse";
import { redactedCopy } from "../src/agent/session";
import { search } from "../src/kb/search";
import type { KbRecord } from "../src/kb/types";

const kb: KbRecord[] = JSON.parse(readFileSync("data/processed/kb.json", "utf8"));
const kbText = (market: string) => kb.filter((record) => record.market === market).map((record) => record.content).join("\n");
const sectionText = (source: string) => {
  const [file, section] = source.split("#");
  return kb.filter((record) => record.source === file && (!section || record.section.includes(section))).map((record) => record.content).join("\n");
};

describe("business rules match the knowledge base (drift guard)", () => {
  it("health rule values appear in the sections they cite", () => {
    expect(sectionText(healthRules.entry_age.source)).toMatch(new RegExp(`between ${healthRules.entry_age.adult_min} and ${healthRules.entry_age.adult_max}`));
    expect(sectionText(healthRules.children.source)).toContain(`${healthRules.children.min_days} days`);
    expect(sectionText(healthRules.children.source)).toContain(`${healthRules.children.max_years} years`);
    for (const option of healthRules.sum_insured_options_lakh.values) expect(sectionText(healthRules.sum_insured_options_lakh.source)).toContain(`Rs ${option} lakh`);
  });

  it("PH and ID rule values appear in the sections they cite", () => {
    expect(sectionText(phRules.grace_period_days.source)).toContain(`${phRules.grace_period_days.value} days`);
    expect(sectionText(phRules.hardship_extension_max_days.source)).toContain(`${phRules.hardship_extension_max_days.value} days`);
    expect(sectionText(idRules.late_fee_rate_per_day.source)).toContain(`${idRules.late_fee_rate_per_day.display} per hari`);
    expect(sectionText(idRules.due_date_change_fee_idr.source)).toContain(idRules.due_date_change_fee_idr.display);
  });

  it("every number a bot line states is present in that market's knowledge base", () => {
    // Placeholders ({amount}) are filled from the account, not stated as policy.
    for (const pack of [healthPack, phLifePack, idFinancePack]) {
      const corpus = kbText(pack.market).replace(/(\d)[.,](\d{3})/g, "$1$2");
      for (const [key, line] of Object.entries(pack.lines)) {
        for (const text of Object.values(line)) {
          const numbers = text.replace(/\{\w+\}/g, "").match(/\d+(?:,\d+)?/g) ?? [];
          for (const number of numbers) expect(corpus, `${pack.market}.${key} says ${number}`).toContain(number);
        }
      }
    }
  });
});

describe("parsing", () => {
  it("reads numbers as recognisers emit them", () => {
    expect(numbersIn("I am thirty eight")).toEqual([38]);
    expect(numbersIn("sixty-five and 10 lakh")).toEqual([65, 10]);
  });

  it("does not treat 'I don't know' as no", () => {
    expect(yesNo("I don't know")).toBeNull();
    expect(yesNo("no, nothing")).toBe("no");
    expect(yesNo("opo")).toBe("yes");
    expect(yesNo("nggih")).toBe("yes");
  });

  it("separates questions from answers that start the same way", () => {
    expect(looksLikeQuestion("Is cosmetic surgery covered")).toBe(true);
    expect(looksLikeQuestion("Ano po mangyayari kapag na-late ako")).toBe(true);
    expect(looksLikeQuestion("Bisa besok saya bayar", true)).toBe(false);
    expect(looksLikeQuestion("Kalau telat dendanya berapa sih")).toBe(true);
  });

  it("resolves promise dates in three languages relative to the call date", () => {
    const friday = new Date("2026-10-02T00:00:00Z");
    expect(resolvePromiseDate("bukas po", friday)).toBe("2026-10-03");
    expect(resolvePromiseDate("besok saya bayar", friday)).toBe("2026-10-03");
    expect(resolvePromiseDate("sa Biyernes po", friday)).toBe("2026-10-09");
    expect(resolvePromiseDate("tanggal 10", friday)).toBe("2026-10-10");
    expect(resolvePromiseDate("on the 1st", friday)).toBe("2026-11-01");
    expect(resolvePromiseDate("minggu depan", friday)).toBe("2026-10-09");
    expect(resolvePromiseDate("someday", friday)).toBeNull();
  });

  it("reads Indonesian birth dates", () => {
    expect(parseBirthDate("Tanggal 12 Maret 1990")).toBe("1990-03-12");
    expect(parseBirthDate("12 3 1990")).toBe("1990-03-12");
    expect(parseBirthDate("dua belas")).toBeNull();
  });
});

describe("localised formats", () => {
  it("says amounts and dates the way the market does", () => {
    expect(rupiahInWords(1250000)).toBe("satu juta dua ratus lima puluh ribu rupiah");
    expect(rupiahInWords(12500)).toBe("dua belas ribu lima ratus rupiah");
    expect(rupiahInWords(1100)).toBe("seribu seratus rupiah");
    expect(tagalogDate("2026-10-07")).toBe("Miyerkules, ika-7 ng Oktubre");
    expect(indonesianDate("2026-10-05")).toBe("Senin, 5 Oktober 2026");
    expect(indonesianDate("2026-10-05", true)).toBe("tanggal 5 Oktober");
  });

  it("looks up the indicative premium from the chart in code", () => {
    expect(indicativePremium(29, 10)?.premium).toBe(9600);
    expect(indicativePremium(65, 25)?.premium).toBe(48200);
    expect(indicativePremium(70, 10)).toBeNull();
  });
});

describe("dialogue engine", () => {
  const clock = new Date("2026-10-02T06:00:00Z");

  it("ends the call without collecting anything when consent is refused", async () => {
    const { state } = startCall(healthPack, clock);
    const { reply } = await handleTurn(healthPack, state, { text: "No, not now" }, clock);
    expect(reply.ended).toBe(true);
    expect(state.outcome?.status).toBe("callback_requested");
    expect(Object.keys(state.slots)).toHaveLength(0);
  });

  it("asks to confirm a conflicting value instead of silently overwriting it", async () => {
    const { state } = startCall(healthPack, clock);
    for (const text of ["yes", "just me", "I am 34", "Pune"]) await handleTurn(healthPack, state, { text }, clock);
    const { reply } = await handleTurn(healthPack, state, { text: "I am 43 years old" }, clock);
    expect(state.stage).toBe("confirm_conflict");
    expect(reply.text).toContain("34 years");
    await handleTurn(healthPack, state, { text: "no" }, clock);
    expect(state.slots.eldest_member_age.value).toBe(34);
  });

  it("accepts a correction without a confirmation question", async () => {
    const { state } = startCall(healthPack, clock);
    for (const text of ["yes", "just me", "I am 34"]) await handleTurn(healthPack, state, { text }, clock);
    await handleTurn(healthPack, state, { text: "actually I am 43" }, clock);
    expect(state.slots.eldest_member_age.value).toBe(43);
    expect(state.stage).toBe("collect");
  });

  it("asks again on low ASR confidence and does not act on the words", async () => {
    const { state } = startCall(healthPack, clock);
    await handleTurn(healthPack, state, { text: "yes" }, clock);
    const { reply } = await handleTurn(healthPack, state, { text: "my wife", asr_confidence: 0.2 }, clock);
    expect(reply.text).toContain("didn't catch");
    expect(state.slots.members_to_cover).toBeUndefined();
  });

  it("never discloses the policy to someone who is not the policyholder", async () => {
    const { state } = startCall(phLifePack, clock);
    const { reply } = await handleTurn(phLifePack, state, { text: "Hindi po, kapatid niya ako" }, clock);
    expect(reply.text).not.toMatch(/premium|pesos|due/i);
    expect(state.outcome?.status).toBe("wrong_person_no_disclosure");
  });

  it("does not reveal the reminder until identity is verified, and escalates after two wrong answers", async () => {
    const { state } = startCall(idFinancePack, clock);
    await handleTurn(idFinancePack, state, { text: "Iya benar" }, clock);
    const wrong = await handleTurn(idFinancePack, state, { text: "1 Januari 1980" }, clock);
    expect(wrong.reply.text).not.toMatch(/rupiah|jatuh tempo/);
    const again = await handleTurn(idFinancePack, state, { text: "2 Januari 1980" }, clock);
    expect(again.reply.escalated).toBe(true);
  });

  it("computes the Indonesian late fee in code from the configured rate", async () => {
    const { state } = startCall(idFinancePack, clock);
    for (const text of ["Iya benar", "12 Maret 1990", "tanggal 10", "lewat aplikasi"]) await handleTurn(idFinancePack, state, { text }, clock);
    // Due date is call date + 3 = 5 Oct; paying 10 Oct is 5 days late.
    expect(state.outcome?.details).toMatchObject({ days_late: 5, estimated_late_fee_idr: 12500 });
  });

  it("masks the account holder's name as a whole word only in stored transcripts", async () => {
    const { state } = startCall(phLifePack, clock);
    await handleTurn(phLifePack, state, { text: "Opo, ako po si Ana" }, clock);
    state.turns.push({ index: 99, speaker: "bot", text: "pasensya na po sa pinagdadaanan ninyo, Ana", at: clock.toISOString() });
    const stored = redactedCopy(state);
    expect(stored.turns.at(-1)!.text).toBe("pasensya na po sa pinagdadaanan ninyo, [CUSTOMER_NAME]");
    expect(JSON.stringify(stored)).not.toMatch(/\bReyes\b|\bAna\b/);
  });
});

describe("grounded answering", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("extractive mode returns only source sentences", () => {
    const result = search("Is cosmetic surgery covered?", { market: "in_health" });
    const answer = extractiveAnswer("Is cosmetic surgery covered?", result.hits[0], result.expanded_query);
    expect(result.hits[0].record.content).toContain(answer);
  });

  it("rejects LLM answers that invent numbers or cite unknown chunks", () => {
    const hits = search("Is cosmetic surgery covered?", { market: "in_health" }).hits;
    const id = hits[0].record.record_id;
    expect(checkLlmAnswer(JSON.stringify({ answerable: true, answer: "Covered after 4 years.", used_ids: [id] }), hits)).toMatchObject({ ok: false, error: expect.stringContaining("number_not_in_context") });
    expect(checkLlmAnswer(JSON.stringify({ answerable: true, answer: "Not covered.", used_ids: ["kb_made_up"] }), hits)).toMatchObject({ ok: false, error: "llm_cited_no_known_chunk" });
    expect(checkLlmAnswer("not json", hits)).toMatchObject({ ok: false, error: "llm_output_not_json" });
    expect(checkLlmAnswer(JSON.stringify({ answerable: false, answer: "" }), hits)).toMatchObject({ ok: false, refused: true });
    expect(checkLlmAnswer(JSON.stringify({ answerable: true, answer: "Cosmetic surgery is excluded unless needed after an accident or burn.", used_ids: [id] }), hits)).toMatchObject({ ok: true });
  });

  it("falls back to the extractive answer when the LLM times out", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("LLM_TIMEOUT_MS", "50");
    vi.stubGlobal("fetch", (_url: string, init: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))));
    const answer = await answerQuestion({ question: "Is cosmetic surgery covered?", market: "in_health", company: "Suraksha", register_instruction: "English" });
    expect(answer.trace.answer_mode).toBe("extractive");
    expect(answer.trace.llm_error).toMatch(/timeout/);
    expect(answer.text).toContain("cosmetic");
  });

  it("uses a valid LLM answer and records the chunks it cited", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const id = search("Is cosmetic surgery covered?", { market: "in_health" }).hits[0].record.record_id;
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ answerable: true, answer: "Cosmetic surgery is excluded unless it is needed after an accident or a burn.", used_ids: [id] }) }] } }] }),
    }));
    const answer = await answerQuestion({ question: "Is cosmetic surgery covered?", market: "in_health", company: "Suraksha", register_instruction: "English" });
    expect(answer.trace.answer_mode).toBe("llm");
    expect(answer.trace.chunk_ids).toEqual([id]);
  });

  it("treats an LLM 'context does not answer' as a refusal, not an answer", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"answerable": false, "answer": "", "used_ids": []}' }] } }] }) }));
    const answer = await answerQuestion({ question: "Apakah Danamaju menyediakan KPR untuk rumah?", market: "id_finance", company: "Danamaju", register_instruction: "Bahasa" });
    expect(answer.text).toBeNull();
    expect(answer.trace.reason).toBe("llm_says_context_does_not_answer");
  });
});
