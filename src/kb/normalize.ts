import glossary from "../../data/glossary.json" with { type: "json" };

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** Accepts ISO, DD/MM/YYYY, DD-MM-YYYY and "1 April 2026"; returns ISO or null. */
export function normalizeDate(raw: string): string | null {
  const value = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  // Indian, Philippine-bank and Indonesian documents in this corpus all write
  // day before month; a US-style date would be misread, which is why the
  // source registry can override effective_date explicitly.
  const numeric = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (numeric) return `${numeric[3]}-${numeric[2].padStart(2, "0")}-${numeric[1].padStart(2, "0")}`;
  const written = value.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})$/);
  if (written && MONTHS[written[2].toLowerCase()]) {
    return `${written[3]}-${MONTHS[written[2].toLowerCase()]}-${written[1].padStart(2, "0")}`;
  }
  return null;
}

/** "2. Waiting Periods" -> "Waiting Periods"; also collapses SHOUTING headings. */
export function normalizeHeading(heading: string): string {
  const stripped = heading.replace(/^\d+(\.\d+)*\.?\s+/, "").replace(/:$/, "").trim();
  if (stripped.length > 3 && stripped === stripped.toUpperCase()) {
    return stripped.toLowerCase().replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
  }
  return stripped;
}

const FIELD_LOOKUP = new Map<string, string>();
for (const [canonical, labels] of Object.entries(glossary.form_fields)) {
  for (const label of labels) FIELD_LOOKUP.set(label.toLowerCase(), canonical);
}

export function canonicalFieldName(label: string): string | null {
  return FIELD_LOOKUP.get(label.trim().toLowerCase()) ?? null;
}

/**
 * Policy documents say "36 months" where the website says "3 years". Both
 * are kept; the year form is appended so search and the consistency check
 * see one unit.
 */
export function annotateDurations(text: string): string {
  return text.replace(/\b(\d+)\s+months\b/gi, (match, count: string) => {
    const months = Number(count);
    return months % 12 === 0 && months >= 12 ? `${match} (${months / 12} years)` : match;
  });
}

/** "Rs 5 lakh" -> also "Rs 500,000" so numeric questions match either form. */
export function annotateIndianAmounts(text: string): string {
  return text.replace(/\bRs\s?(\d+(?:\.\d+)?)\s+lakh\b/gi, (match, amount: string) => {
    const rupees = Math.round(Number(amount) * 100000);
    return `${match} (Rs ${rupees.toLocaleString("en-IN")})`;
  });
}
