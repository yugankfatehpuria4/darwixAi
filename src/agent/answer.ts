import { search, type SearchHit } from "../kb/search";
import type { Category, Market } from "../kb/types";
import { contentTokens } from "../text";
import { generateJson, llmConfigured } from "./llm";
import type { RetrievalTrace } from "./types";

export interface AnswerRequest {
  question: string;
  market: Market;
  company: string;
  /** Plain-language instruction for the LLM, e.g. "natural Taglish with po/opo". */
  register_instruction: string;
  categories?: Category[];
  audience?: "customer" | "agent";
}

export interface GroundedAnswer {
  text: string | null;
  trace: RetrievalTrace;
  retrieval_ms: number;
  llm_ms?: number;
}

const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 2500);

const SUGGESTED_WORDING = /(?:Say|Halimbawa|Contoh):\s*"([^"]+)"/;

function sentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text]).map((sentence) => sentence.trim()).filter(Boolean);
}

/**
 * The no-LLM answer: words straight from the source, so it cannot add a
 * fact. FAQ chunks give their answer, script chunks their approved wording,
 * anything else the one or two sentences that overlap the question most.
 */
export function extractiveAnswer(question: string, hit: SearchHit, expandedQuery: string): string {
  const content = hit.record.content;
  const suggested = content.match(SUGGESTED_WORDING);
  if (suggested) return suggested[1];
  const body = content.includes("\nA: ") ? content.split("\nA: ")[1] : content;
  const candidates = sentences(body.replace(/^\d+(\.\d+)*\s+/, ""));
  const wanted = new Set(contentTokens(`${question} ${expandedQuery}`));
  const scored = candidates.map((sentence, position) => ({
    sentence,
    position,
    score: contentTokens(sentence).filter((token) => wanted.has(token)).length,
  }));
  const best = [...scored].sort((a, b) => b.score - a.score || a.position - b.position).slice(0, 2);
  const chosen = best.filter((candidate, index) => index === 0 || candidate.score > 0).sort((a, b) => a.position - b.position);
  return chosen.map((candidate) => candidate.sentence).join(" ");
}

function numbersOf(text: string): string[] {
  return (text.replace(/(\d)[,.](\d{3})/g, "$1$2").match(/\d+(?:[.,]\d+)?/g) ?? []).map((value) => value.replace(",", "."));
}

const SYSTEM_PROMPT = (company: string, register: string) => `You are a phone agent for ${company}. Answer the caller using ONLY the numbered context passages.
Rules:
- Reply in ${register}. At most two short spoken sentences. No lists, no markdown.
- Do not add any fact, number, product, discount or promise that is not in the passages.
- Never promise that a claim, application, extension or restructuring will be approved.
- If the passages do not answer the question, set "answerable" to false and leave "answer" empty.
Return JSON only: {"answerable": boolean, "answer": string, "used_ids": [string]}`;

export async function answerQuestion(request: AnswerRequest): Promise<GroundedAnswer> {
  const retrievalStarted = performance.now();
  const retrieved = search(request.question, {
    market: request.market,
    categories: request.categories,
    audience: request.audience ?? "customer",
    topK: 3,
  });
  const retrievalMs = Math.round((performance.now() - retrievalStarted) * 10) / 10;

  const trace: RetrievalTrace = {
    query: request.question,
    answerable: retrieved.answerable,
    reason: retrieved.reason,
    confidence: Number(retrieved.confidence.toFixed(3)),
    chunk_ids: retrieved.hits.map((hit) => hit.record.record_id),
    citations: retrieved.hits.map((hit) => hit.citation),
    answer_mode: "fallback",
  };
  if (!retrieved.answerable) return { text: null, trace, retrieval_ms: retrievalMs };

  if (llmConfigured()) {
    const passages = retrieved.hits
      .map((hit) => `[${hit.record.record_id}] ${hit.record.title} > ${hit.record.section}\n${hit.record.content}`)
      .join("\n\n");
    const llm = await generateJson(SYSTEM_PROMPT(request.company, request.register_instruction), `Context:\n${passages}\n\nCaller: ${request.question}`, LLM_TIMEOUT_MS);
    if (llm.ok) {
      const verdict = checkLlmAnswer(llm.text, retrieved.hits);
      if (verdict.ok) {
        return { text: verdict.answer, trace: { ...trace, answer_mode: "llm", chunk_ids: verdict.used_ids }, retrieval_ms: retrievalMs, llm_ms: llm.ms };
      }
      if (verdict.refused) {
        // The model read the passages and says they do not answer the
        // question: a second, semantic check on top of the cosine gate.
        return { text: null, trace: { ...trace, answerable: false, reason: "llm_says_context_does_not_answer", answer_mode: "fallback" }, retrieval_ms: retrievalMs, llm_ms: llm.ms };
      }
      trace.llm_error = verdict.error;
    } else {
      trace.llm_error = llm.error;
    }
    return { text: extractiveAnswer(request.question, retrieved.hits[0], retrieved.expanded_query), trace: { ...trace, answer_mode: "extractive", chunk_ids: [retrieved.hits[0].record.record_id] }, retrieval_ms: retrievalMs, llm_ms: llm.ms };
  }

  return {
    text: extractiveAnswer(request.question, retrieved.hits[0], retrieved.expanded_query),
    trace: { ...trace, answer_mode: "extractive", chunk_ids: [retrieved.hits[0].record.record_id] },
    retrieval_ms: retrievalMs,
  };
}

type LlmVerdict = { ok: true; answer: string; used_ids: string[] } | { ok: false; refused: boolean; error: string };

/** Rejects answers that cite chunks we did not give it or contain numbers absent from the passages. */
export function checkLlmAnswer(raw: string, hits: SearchHit[]): LlmVerdict {
  let parsed: { answerable?: boolean; answer?: string; used_ids?: string[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, refused: false, error: "llm_output_not_json" };
  }
  if (parsed.answerable === false) return { ok: false, refused: true, error: "llm_refused" };
  const answer = parsed.answer?.trim();
  if (!answer) return { ok: false, refused: false, error: "llm_empty_answer" };
  const known = new Set(hits.map((hit) => hit.record.record_id));
  const usedIds = (parsed.used_ids ?? []).filter((id) => known.has(id));
  if (!usedIds.length) return { ok: false, refused: false, error: "llm_cited_no_known_chunk" };
  const contextNumbers = new Set(hits.flatMap((hit) => numbersOf(hit.record.content)));
  const invented = numbersOf(answer).filter((value) => !contextNumbers.has(value));
  if (invented.length) return { ok: false, refused: false, error: `llm_number_not_in_context: ${invented.join(",")}` };
  return { ok: true, answer, used_ids: usedIds };
}
