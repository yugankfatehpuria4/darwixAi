import { createHmac } from "node:crypto";
import type { PiiFinding } from "./types";

/**
 * What happens to each PII type before text is stored or indexed.
 * masked  -> replaced with a typed placeholder, so the sentence still reads
 * removed -> placeholder too, but these are identifiers with no use in a
 *            knowledge base at all and are also never logged
 * Customer records (form submissions) are excluded from the KB entirely;
 * only a hashed lead reference is kept in the ingest report.
 */
export const PII_POLICY = {
  email: "masked",
  phone: "masked",
  person_name: "masked",
  pin_code: "masked",
  date_of_birth: "removed",
  pan: "removed",
  aadhaar: "removed",
  nik: "removed",
} as const;

type PiiType = keyof typeof PII_POLICY;

const PATTERNS: Array<[PiiType, RegExp]> = [
  ["email", /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g],
  ["pan", /\b[A-Z]{5}\d{4}[A-Z]\b/g],
  ["nik", /\b\d{16}\b/g],
  ["aadhaar", /\b\d{4}\s\d{4}\s\d{4}\b/g],
  // Mobile numbers for IN (+91, 10 digits from 6-9), PH (+63 / 09xx) and
  // ID (+62 / 08xx). Toll-free 1800 numbers are business contacts, not PII.
  ["phone", /(?:\+(?:91|63|62)[\s-]?)?(?<![\d-])(?:[6-9]\d{4}[\s-]?\d{5}|0?9\d{2}[\s-]?\d{3}[\s-]?\d{4}|0?8\d{2}[\s-]?\d{3,4}[\s-]?\d{3,4})(?![\d-])/g],
];

const LABELLED_FIELDS: Array<[PiiType, RegExp]> = [
  ["person_name", /^((?:Name of Proposer|Applicant Name|Name|Nama(?: Lengkap)?)\s*:\s*)(.+)$/gim],
  ["date_of_birth", /^((?:DOB|Date of Birth[^:\n]*|Tanggal Lahir)\s*:\s*)(.+)$/gim],
  ["pin_code", /^((?:Pin Code|Pincode|Kode Pos)\s*:\s*)(.+)$/gim],
];

// "Priya Sharma (priya@..., +91 ...)": a capitalised two-word name that is
// immediately followed by contact details is a person, not a product name.
const CONTACT_PERSON = /\b(\p{Lu}\p{Ll}+ \p{Lu}\p{Ll}+)(?=\s*\((?:[^)]*@|[^)]*\+\d))/gu;

// Self-introductions in call transcripts. Recognisers capitalise names, so
// a capitalised word or two after the phrase is taken as the name. "This is"
// is left out on purpose: the bot itself says "this is Asha".
// No "i" flag: with it, \p{Lu} would also match lowercase words.
const SELF_INTRODUCTION = /\b([Mm]y name is|[Ii] am called|[Aa]ko si|[Aa]ng pangalan ko ay|[Nn]ama saya|[Ss]aya bernama)\s+(\p{Lu}\p{Ll}+(?:\s\p{Lu}\p{Ll}+)?)/gu;

export interface RedactionResult {
  text: string;
  findings: PiiFinding[];
}

export function redactPii(text: string): RedactionResult {
  const findings: PiiFinding[] = [];
  const record = (type: PiiType) => findings.push({ type, action: PII_POLICY[type] });
  let redacted = text;

  for (const [type, pattern] of LABELLED_FIELDS) {
    redacted = redacted.replace(pattern, (match, label: string, value: string) => {
      if (!value.trim() || /^_+$/.test(value.trim()) || value.trim() === "(blank)") return match;
      record(type);
      return `${label}[${type.toUpperCase()}]`;
    });
  }
  redacted = redacted.replace(SELF_INTRODUCTION, (match, phrase: string) => {
    record("person_name");
    return `${phrase} [PERSON_NAME]`;
  });
  redacted = redacted.replace(CONTACT_PERSON, () => {
    record("person_name");
    return "[PERSON_NAME]";
  });
  for (const [type, pattern] of PATTERNS) {
    redacted = redacted.replace(pattern, () => {
      record(type);
      return `[${type.toUpperCase()}]`;
    });
  }
  return { text: redacted, findings };
}

/**
 * Keyed hash so a lead can be matched across exports without storing the
 * phone number. A plain SHA-256 of a 10-digit number is brute-forceable in
 * seconds, hence the HMAC key from the environment.
 */
export function hashedReference(value: string): string {
  const key = process.env.PII_HASH_KEY || "dev-only-pii-hash-key";
  return createHmac("sha256", key).update(value.replace(/\D/g, "") || value).digest("hex").slice(0, 16);
}
