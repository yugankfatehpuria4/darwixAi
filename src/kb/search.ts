import { existsSync, readFileSync } from "node:fs";
import glossary from "../../data/glossary.json" with { type: "json" };
import { applyCanonicalTerms, contentTokens, expandQuery, tokenize, type ExpansionLanguage } from "../text";
import { KB_PATH } from "./ingest";
import type { Category, KbRecord, Market } from "./types";

// Below this cosine (char n-gram TF-IDF, query vs best chunk) we say "not in
// the knowledge base" instead of answering. Chosen from the threshold sweep
// in evidence/q2/retrieval_results.md; see that file before changing it.
export const DEFAULT_MIN_CONFIDENCE = 0.2;

const BRAND_TERMS = new Set(glossary.brand_terms);
const withoutBrandTerms = (text: string) => tokenize(text).filter((token) => !BRAND_TERMS.has(token)).join(" ");

const BM25_K1 = 1.2;
const BM25_B = 0.75;
const RRF_K = 60;

const MARKET_LANGUAGES: Record<Market, ExpansionLanguage[]> = {
  in_health: ["en"],
  ph_life: ["tl", "en"],
  id_finance: ["id"],
};

export interface SearchOptions {
  market: Market;
  categories?: Category[];
  /** Restrict to records the bot may say to a caller, or to agent-facing guidance. */
  audience?: "customer" | "agent";
  topK?: number;
  minConfidence?: number;
  expand?: boolean;
  /** Ablation switch for the eval script; production paths use "hybrid". */
  mode?: "hybrid" | "bm25" | "char";
}

export interface SearchHit {
  record: KbRecord;
  rank: number;
  fused_score: number;
  bm25: number;
  cosine: number;
  citation: string;
}

export interface SearchResult {
  query: string;
  expanded_query: string;
  hits: SearchHit[];
  confidence: number;
  answerable: boolean;
  reason: string;
}

interface IndexedRecord {
  record: KbRecord;
  terms: Map<string, number>;
  length: number;
  charVector: Map<string, number>;
  charNorm: number;
}

interface Index {
  records: IndexedRecord[];
  documentFrequency: Map<string, number>;
  charDocumentFrequency: Map<string, number>;
  averageLength: number;
}

/**
 * Character 3-5 grams inside word boundaries. They make "mencicil" match
 * "cicilan", "na-late" match "late", and survive the odd ASR misspelling,
 * which word-level BM25 cannot do without a stemmer per language.
 */
function charGrams(text: string): Map<string, number> {
  const grams = new Map<string, number>();
  for (const token of contentTokens(text)) {
    const padded = ` ${token} `;
    for (let size = 3; size <= 5; size++) {
      for (let start = 0; start + size <= padded.length; start++) {
        const gram = padded.slice(start, start + size);
        grams.set(gram, (grams.get(gram) ?? 0) + 1);
      }
    }
  }
  return grams;
}

function countTerms(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
}

function weightChars(grams: Map<string, number>, df: Map<string, number>, total: number): { vector: Map<string, number>; norm: number } {
  const vector = new Map<string, number>();
  let squared = 0;
  for (const [gram, count] of grams) {
    const weight = (1 + Math.log(count)) * Math.log((total + 1) / ((df.get(gram) ?? 0) + 1));
    vector.set(gram, weight);
    squared += weight * weight;
  }
  return { vector, norm: Math.sqrt(squared) };
}

let cachedIndex: Index | null = null;

export function buildIndex(records: KbRecord[]): Index {
  const active = records.filter((record) => record.metadata.status === "active");
  const documentFrequency = new Map<string, number>();
  const charDocumentFrequency = new Map<string, number>();
  const prepared = active.map((record) => {
    const tokens = contentTokens(record.search_text);
    const terms = countTerms(tokens);
    const grams = charGrams(record.search_text);
    for (const term of terms.keys()) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    for (const gram of grams.keys()) charDocumentFrequency.set(gram, (charDocumentFrequency.get(gram) ?? 0) + 1);
    return { record, terms, length: tokens.length, grams };
  });
  const indexed = prepared.map(({ record, terms, length, grams }) => {
    const { vector, norm } = weightChars(grams, charDocumentFrequency, prepared.length);
    return { record, terms, length, charVector: vector, charNorm: norm };
  });
  return {
    records: indexed,
    documentFrequency,
    charDocumentFrequency,
    averageLength: indexed.reduce((sum, entry) => sum + entry.length, 0) / Math.max(indexed.length, 1),
  };
}

function loadIndex(): Index {
  // Built once per process. Ingestion writes kb.json; call resetIndex() after
  // re-ingesting inside a running server.
  if (!cachedIndex) {
    if (!existsSync(KB_PATH)) throw new Error(`${KB_PATH} not found: run "npm run ingest" first`);
    cachedIndex = buildIndex(JSON.parse(readFileSync(KB_PATH, "utf8")));
  }
  return cachedIndex;
}

/** Builds the index up front so the first caller does not pay for it. Returns build time in ms. */
export function warmIndex(): number {
  const started = performance.now();
  loadIndex();
  return Math.round(performance.now() - started);
}

export function resetIndex(): void {
  cachedIndex = null;
}

function bm25(index: Index, entry: IndexedRecord, queryTerms: string[]): number {
  let score = 0;
  for (const term of queryTerms) {
    const frequency = entry.terms.get(term);
    if (!frequency) continue;
    const df = index.documentFrequency.get(term) ?? 0;
    const idf = Math.log(1 + (index.records.length - df + 0.5) / (df + 0.5));
    score += (idf * frequency * (BM25_K1 + 1)) / (frequency + BM25_K1 * (1 - BM25_B + (BM25_B * entry.length) / index.averageLength));
  }
  return score;
}

function cosine(index: Index, entry: IndexedRecord, query: { vector: Map<string, number>; norm: number }): number {
  if (!query.norm || !entry.charNorm) return 0;
  let dot = 0;
  for (const [gram, weight] of query.vector) {
    const other = entry.charVector.get(gram);
    if (other) dot += weight * other;
  }
  return dot / (query.norm * entry.charNorm);
}

export function formatCitation(record: KbRecord): string {
  const where = record.section ? `${record.title} > ${record.section}` : record.title;
  return `${where} [${record.record_id}] (${record.source_url}, v${record.version}${record.effective_date ? `, effective ${record.effective_date}` : ""})`;
}

export function search(query: string, options: SearchOptions, index: Index = loadIndex()): SearchResult {
  const topK = options.topK ?? 3;
  const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  // The query gets the same canonical-term rewrite as the indexed text, or
  // "coverage amounts" would never meet chunks indexed as "sum insured".
  const expanded = applyCanonicalTerms(options.expand === false ? query : expandQuery(query, MARKET_LANGUAGES[options.market]));
  const queryTerms = [...new Set(contentTokens(expanded))];
  const queryChars = weightChars(charGrams(expanded), index.charDocumentFrequency, index.records.length);

  const candidates = index.records.filter(
    (entry) =>
      entry.record.market === options.market &&
      (!options.categories || options.categories.includes(entry.record.category)) &&
      (!options.audience || entry.record.audience === options.audience),
  );
  const scored = candidates.map((entry) => ({
    entry,
    bm25: bm25(index, entry, queryTerms),
    cosine: cosine(index, entry, queryChars),
  }));

  // Reciprocal rank fusion: the two scores live on different scales, so we
  // fuse ranks rather than trying to normalise and add the raw numbers. A
  // zero score gets no rank at all; otherwise every non-matching chunk would
  // receive an arbitrary BM25 rank from sort order and outvote the other list.
  const rankOf = (key: "bm25" | "cosine") => {
    const ranks = new Map<IndexedRecord, number>();
    [...scored]
      .filter((candidate) => candidate[key] > 0)
      .sort((a, b) => b[key] - a[key])
      .forEach((candidate, position) => ranks.set(candidate.entry, position + 1));
    return ranks;
  };
  const bm25Ranks = rankOf("bm25");
  const cosineRanks = rankOf("cosine");
  const rrf = (rank: number | undefined) => (rank === undefined ? 0 : 1 / (RRF_K + rank));
  const mode = options.mode ?? "hybrid";
  const fused = scored
    .filter((candidate) => candidate.bm25 > 0 || candidate.cosine > 0)
    .map((candidate) => ({
      ...candidate,
      fused:
        mode === "bm25" ? candidate.bm25 :
        mode === "char" ? candidate.cosine :
        rrf(bm25Ranks.get(candidate.entry)) + rrf(cosineRanks.get(candidate.entry)),
    }))
    .sort((a, b) => b.fused - a.fused)
    .slice(0, topK);

  const hits: SearchHit[] = fused.map((candidate, position) => ({
    record: candidate.entry.record,
    rank: position + 1,
    fused_score: Number(candidate.fused.toFixed(5)),
    bm25: Number(candidate.bm25.toFixed(3)),
    cosine: Number(candidate.cosine.toFixed(3)),
    citation: formatCitation(candidate.entry.record),
  }));

  // Confidence is measured without brand names: "Does Danamaju offer home
  // loans?" shares "Danamaju" with every chunk and would otherwise look like
  // a confident match for a product that does not exist.
  const top = fused[0];
  const topicChars = weightChars(charGrams(withoutBrandTerms(expanded)), index.charDocumentFrequency, index.records.length);
  const confidence = top ? cosine(index, top.entry, topicChars) : 0;
  let reason = "ok";
  if (!hits.length || !tokenize(query).length) reason = "no_candidates";
  else if (confidence < minConfidence) reason = `top_cosine_${confidence.toFixed(3)}_below_${minConfidence}`;

  return {
    query,
    expanded_query: expanded,
    hits,
    confidence,
    answerable: reason === "ok",
    reason,
  };
}
