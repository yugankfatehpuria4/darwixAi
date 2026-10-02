import glossary from "../data/glossary.json" with { type: "json" };

export type LanguageCode = "en" | "tl" | "taglish" | "id";

const STOPWORDS = new Set([
  // English
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "am", "i", "you", "we", "they", "he", "she", "it",
  "my", "your", "our", "their", "me", "us", "of", "to", "in", "on", "at", "for", "with", "and", "or", "if", "do",
  "does", "did", "can", "could", "will", "would", "should", "what", "which", "who", "how", "when", "where", "why",
  "this", "that", "these", "those", "there", "any", "have", "has", "had", "not", "no", "yes", "so", "by", "from",
  "as", "about", "get", "need", "want", "tell", "please", "also", "just", "much", "many", "some", "all",
  // Tagalog function words
  "ang", "ng", "mga", "sa", "na", "ba", "po", "ko", "mo", "ka", "kayo", "ako", "ito", "yung", "iyong", "at",
  "pa", "lang", "naman", "kasi", "din", "rin", "ay", "nga", "si", "ni", "kung", "kapag", "pag", "pwede", "ano",
  "paano", "saan", "kailan", "ninyo", "nyo", "natin", "namin",
  // Indonesian function words
  "yang", "dan", "di", "ke", "dari", "ini", "itu", "untuk", "dengan", "ada", "saya", "kami", "kita", "anda",
  "apa", "apakah", "bisa", "nya", "juga", "atau", "akan", "sudah", "belum", "kalau", "jika", "bagaimana",
  "berapa", "mau", "ya", "pak", "bu", "bapak", "ibu", "dong", "sih", "kok", "aja", "saja", "tidak",
]);

const TAGALOG_MARKERS = new Set([
  "ang", "ng", "mga", "po", "opo", "ko", "mo", "ba", "yung", "kasi", "lang", "naman", "hindi", "oo", "sige",
  "pwede", "ako", "kayo", "ninyo", "natin", "wala", "meron", "kapag", "pag", "ano", "paano", "saan", "kailan",
  "salamat", "pala", "talaga", "ito", "iyon", "dito", "doon", "bakit", "gusto", "kailangan", "bayad", "pera",
  "na", "sa", "nga", "din", "rin", "pa", "si", "ni", "nang", "kung", "lahat", "ayoko", "ayaw",
]);

const INDONESIAN_MARKERS = new Set([
  "yang", "dan", "di", "ke", "dari", "ini", "itu", "untuk", "dengan", "ada", "saya", "tidak", "bisa", "sudah",
  "belum", "kalau", "bagaimana", "berapa", "nggak", "gak", "udah", "gimana", "bapak", "ibu", "terima", "kasih",
  "cicilan", "angsuran", "bayar", "telat", "mau", "aja", "dong", "sih", "kok", "lagi", "nih", "tolong",
  "mboten", "nggih", "sampun", "teu", "atuh", "punten", "piye", "pripun",
]);

const ENGLISH_MARKERS = new Set([
  "the", "is", "are", "what", "how", "my", "your", "i", "you", "can", "do", "does", "will", "if", "and", "of",
  "to", "for", "with", "this", "that", "have", "has", "not", "need", "want", "please", "when", "about",
]);

export function normalizeWhitespace(text: string): string {
  return text.replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

export function tokenize(text: string): string[] {
  // Keep hyphenated Tagalog forms ("na-late", "i-cancel") intact; they carry the meaning.
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^-+|-+$/g, ""))
    .filter(Boolean);
}

export function contentTokens(text: string): string[] {
  return tokenize(text).filter((token) => !STOPWORDS.has(token) && token.length > 1);
}

export interface LanguageGuess {
  language: LanguageCode;
  english_ratio: number;
}

/**
 * Lexicon-based guess. Good enough to pick a reply register per utterance;
 * it is not a general language identifier. "taglish" means both Tagalog and
 * English function words are present in meaningful share.
 */
export function detectLanguage(text: string): LanguageGuess {
  const tokens = tokenize(text);
  let tl = 0;
  let id = 0;
  let en = 0;
  for (const token of tokens) {
    if (TAGALOG_MARKERS.has(token)) tl++;
    if (INDONESIAN_MARKERS.has(token)) id++;
    if (ENGLISH_MARKERS.has(token)) en++;
  }
  // One stray marker is not enough: "Hindi" the language is also the
  // Tagalog word for "no".
  if (tl < 2) tl = 0;
  if (id < 2) id = 0;
  const local = Math.max(tl, id);
  const englishRatio = en + local === 0 ? 1 : en / (en + local);
  if (local === 0) return { language: "en", english_ratio: englishRatio };
  if (id > tl) return { language: "id", english_ratio: englishRatio };
  if (en > 0 && englishRatio >= 0.2) return { language: "taglish", english_ratio: englishRatio };
  // Taglish speakers drop English nouns in without English function words
  // ("na-late po ako sa premium"), so count Latin loanwords as English too.
  const englishContent = tokens.filter((token) => /^(premium|policy|coverage|rider|beneficiary|due|payment|late|cancel|lapse|claim)$/.test(token)).length;
  return { language: englishContent > 0 ? "taglish" : "tl", english_ratio: englishRatio };
}

export type ExpansionLanguage = keyof typeof glossary.query_expansions;

export function expandQuery(query: string, languages: ExpansionLanguage[]): string {
  const tokens = tokenize(query);
  const extra: string[] = [];
  for (const language of languages) {
    const table = glossary.query_expansions[language] as Record<string, string>;
    for (const token of tokens) {
      if (table[token]) extra.push(table[token]);
    }
    for (const [phrase, expansion] of Object.entries(table)) {
      if (phrase.includes(" ") && query.toLowerCase().includes(phrase)) extra.push(expansion);
    }
  }
  return extra.length ? `${query} ${extra.join(" ")}` : query;
}

export function applyCanonicalTerms(text: string): string {
  let normalized = text.toLowerCase();
  for (const [canonical, variants] of Object.entries(glossary.terms)) {
    // Longest variant first so "sum insured required" wins over "sum insured".
    for (const variant of [...variants].sort((a, b) => b.length - a.length)) {
      const pattern = new RegExp(`(?<![\\p{L}])${escapeRegExp(variant)}s?(?![\\p{L}])`, "gu");
      normalized = normalized.replace(pattern, canonical);
    }
  }
  return normalized;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
