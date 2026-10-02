import { tokenize } from "../text";

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
};

/**
 * Integers as speech recognisers emit them: usually digits, sometimes words
 * ("thirty eight", "sixty-five"). Returns every number found, in order.
 */
export function numbersIn(text: string): number[] {
  const found: number[] = [];
  const words = text.toLowerCase().replace(/(\d),(\d)/g, "$1$2").split(/[^a-z0-9]+/).filter(Boolean);
  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    if (/^\d+$/.test(word)) {
      found.push(Number(word));
      continue;
    }
    const value = NUMBER_WORDS[word];
    if (value === undefined) continue;
    const next = NUMBER_WORDS[words[index + 1]];
    if (value >= 20 && value % 10 === 0 && next !== undefined && next < 10) {
      found.push(value + next);
      index++;
    } else {
      found.push(value);
    }
  }
  return found;
}

const YES = /\b(yes|yeah|yep|yup|sure|okay|ok|correct|right|go ahead|fine|oo|opo|oho|sige|tama|ya|iya|betul|benar|boleh|silakan|nggih|inggih|muhun|leres)\b/i;
const NO = /\b(no|nope|not really|don'?t|do not|never|none|hindi|wala|ayoko|ayaw|huwag|tidak|nggak|enggak|gak|ndak|mboten|teu|bukan|jangan)\b/i;

export type YesNo = "yes" | "no" | null;

const NOT_SURE = /\b(don'?t know|not sure|no idea|hindi ko (pa )?alam|di ko alam|tidak tahu|belum tahu|belum tau|nggak tau|gak tau)\b/i;

/** "no" wins ties: "yes, no wait" and "yeah I don't" are treated as no. "I don't know" is neither. */
export function yesNo(text: string): YesNo {
  if (NOT_SURE.test(text)) return null;
  if (NO.test(text)) return "no";
  if (YES.test(text)) return "yes";
  return null;
}

const QUESTION_STARTERS = new Set([
  "what", "how", "does", "do", "is", "are", "can", "will", "when", "where", "why", "which", "should", "could",
  "would", "who", "whats", "tell", "explain",
  "ano", "paano", "saan", "kailan", "bakit", "magkano", "pwede", "puwede", "may", "meron", "sino", "alin",
  "apa", "apakah", "bagaimana", "gimana", "kapan", "berapa", "bisa", "boleh", "kenapa", "mengapa", "dimana",
  "kok", "piye", "pripun", "kumaha", "sabaraha", "pinten",
]);

// Openers that also start ordinary answers: "Bisa, besok saya bayar",
// "Pwede sa Biyernes", "Is 10 lakh okay". Ignored in strict mode.
const WEAK_STARTERS = new Set(["bisa", "boleh", "pwede", "puwede", "may", "meron", "do", "does", "is", "are", "can", "will", "would", "could", "should"]);

/**
 * Speech recognisers rarely emit "?", so a question is recognised by its
 * opening word or a Tagalog/Indonesian question particle anywhere in it.
 * `strict` is used when the same utterance already answered the bot's
 * question, so only unambiguous question words count.
 */
// Questions asked as statements: "I'd like to know what happens if...".
const INDIRECT_QUESTION = /\b(i'?d like to know|i want to know|can you tell me|could you tell me|i'?m wondering|i was wondering|gusto ko (pong )?malaman|pakisabi|saya mau tanya|mau nanya|mau tanya|numpang tanya|boleh tanya)\b/i;

export function looksLikeQuestion(text: string, strict = false): boolean {
  if (text.includes("?") || INDIRECT_QUESTION.test(text)) return true;
  const tokens = tokenize(text);
  if (!tokens.length) return false;
  const opener = tokens.find((token) => !["so", "and", "but", "also", "um", "uh", "po", "eh", "pak", "bu", "mas", "mbak", "sir", "maam", "ma'am", "tapi", "terus"].includes(token));
  if (opener && QUESTION_STARTERS.has(opener) && !(strict && WEAK_STARTERS.has(opener))) return true;
  if (tokens.includes("ba")) return true;
  const indonesianQuestionWord = tokens.some((token) => ["apa", "berapa", "gimana", "bagaimana", "kapan"].includes(token));
  return indonesianQuestionWord && tokens.length > 2;
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  linggo: 0, lunes: 1, martes: 2, miyerkules: 3, huwebes: 4, biyernes: 5, sabado: 6,
  minggu: 0, senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, sabtu: 6,
};

const MONTH_NAMES: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  enero: 1, pebrero: 2, marso: 3, abril: 4, mayo: 5, hunyo: 6, hulyo: 7, agosto: 8, setyembre: 9, oktubre: 10, nobyembre: 11, disyembre: 12,
  januari: 1, februari: 2, maret: 3, juni: 6, juli: 7, agustus: 8, oktober: 10, desember: 12,
};

export const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * Resolves the date expressions customers use for a payment promise in the
 * three markets. Deliberately small: anything it cannot resolve returns null
 * and the bot asks again rather than guessing a date.
 */
export function resolvePromiseDate(text: string, today: Date): string | null {
  const lower = text.toLowerCase();
  if (/\b(today|ngayon|ngayong araw|hari ini|dina ieu|dinten puniki)\b/.test(lower)) return toIsoDate(today);
  if (/\b(tomorrow|bukas|besok|enjing|isukan|sesuk)\b/.test(lower)) return toIsoDate(addDays(today, 1));
  if (/\b(day after tomorrow|sa makalawa|lusa)\b/.test(lower)) return toIsoDate(addDays(today, 2));
  if (/\b(next week|sa susunod na linggo|minggu depan|minggu ngajeng|minggu ngarep|minggon payun)\b/.test(lower)) return toIsoDate(addDays(today, 7));

  for (const [name, weekday] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b${name}\\b`).test(lower) && !(name === "minggu" && /minggu (depan|ngajeng|ngarep)/.test(lower))) {
      const ahead = (weekday - today.getUTCDay() + 7) % 7 || 7;
      return toIsoDate(addDays(today, ahead));
    }
  }

  // "15 October", "October 15", "tanggal 15", "sa 15", "on the 15th"
  const monthMatch = Object.entries(MONTH_NAMES).find(([name]) => new RegExp(`\\b${name}\\b`).test(lower));
  const day = lower.match(/\b(?:tanggal|tgl|sa|on the|on|the|ika-?)?\s*(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (day) {
    const dayOfMonth = Number(day[1]);
    if (dayOfMonth < 1 || dayOfMonth > 31) return null;
    let month = monthMatch ? monthMatch[1] - 1 : today.getUTCMonth();
    let year = today.getUTCFullYear();
    if (!monthMatch && dayOfMonth < today.getUTCDate()) month += 1;
    if (month > 11) {
      month -= 12;
      year += 1;
    }
    return toIsoDate(new Date(Date.UTC(year, month, dayOfMonth)));
  }
  return null;
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);
}
