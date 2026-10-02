import { describe, expect, it } from "vitest";
import { chunkDocument } from "../src/kb/chunk";
import { dropDuplicateChunks } from "../src/kb/dedup";
import { annotateDurations, canonicalFieldName, normalizeDate, normalizeHeading } from "../src/kb/normalize";
import { redactPii } from "../src/kb/pii";
import { categorize } from "../src/kb/taxonomy";
import type { ExtractedDocument, KbRecord } from "../src/kb/types";
import { applyCanonicalTerms, detectLanguage } from "../src/text";

const source = {
  path: "test/doc.md",
  source_url: "internal://test",
  market: "in_health" as const,
  doc_type: "policy" as const,
  authority: "internal_policy" as const,
  access: "internal" as const,
};

describe("chunking", () => {
  it("keeps an FAQ question with its answer in one chunk", () => {
    const document: ExtractedDocument = {
      source,
      title: "FAQ",
      version: "1.0",
      effective_date: null,
      blocks: [
        { heading_path: ["FAQ", "Can I pay monthly?"], text: "Yes, through auto-debit.", kind: "faq" },
        { heading_path: ["FAQ", "Can I pay monthly?"], text: "Annual payment costs less.", kind: "faq" },
      ],
    };
    const chunks = chunkDocument(document);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe("Q: Can I pay monthly?\nA: Yes, through auto-debit. Annual payment costs less.");
  });

  it("never merges two policy clauses, even under the same section", () => {
    const document: ExtractedDocument = {
      source,
      title: "Wordings",
      version: "1.0",
      effective_date: null,
      blocks: [
        { heading_path: ["2. Waiting Periods"], text: "2.1 Initial waiting period is 30 days.", kind: "clause" },
        { heading_path: ["2. Waiting Periods"], text: "2.2 Pre-existing diseases wait 36 months.", kind: "clause" },
      ],
    };
    const chunks = chunkDocument(document);
    expect(chunks.map((chunk) => chunk.content)).toEqual([
      "2.1 Initial waiting period is 30 days.",
      "2.2 Pre-existing diseases wait 36 months.",
    ]);
    expect(chunks[0].section).toBe("Waiting Periods");
  });

  it("splits overlong prose at sentence boundaries with one sentence of overlap", () => {
    const sentence = (n: number) => `Sentence number ${n} talks about coverage and waiting periods in some detail here.`;
    const text = Array.from({ length: 30 }, (_, n) => sentence(n)).join(" ");
    const chunks = chunkDocument({ source, title: "Long", version: "1.0", effective_date: null, blocks: [{ heading_path: ["Long"], text, kind: "prose" }] });
    expect(chunks.length).toBeGreaterThan(1);
    const lastSentenceOfFirst = chunks[0].content.split(". ").pop()!;
    expect(chunks[1].content.startsWith(lastSentenceOfFirst.replace(/\.$/, ""))).toBe(true);
    for (const chunk of chunks) expect(chunk.content.endsWith(".")).toBe(true);
  });
});

describe("normalization", () => {
  it("reads day-first dates and ISO dates", () => {
    expect(normalizeDate("01/04/2026")).toBe("2026-04-01");
    expect(normalizeDate("14-09-2026")).toBe("2026-09-14");
    expect(normalizeDate("2026-02-01")).toBe("2026-02-01");
    expect(normalizeDate("1 April 2026")).toBe("2026-04-01");
    expect(normalizeDate("next Tuesday")).toBeNull();
  });

  it("strips clause numbering from headings and fixes shouting", () => {
    expect(normalizeHeading("2. Waiting Periods")).toBe("Waiting Periods");
    expect(normalizeHeading("PERMANENT EXCLUSIONS")).toBe("Permanent Exclusions");
  });

  it("maps inconsistent wording to one canonical term", () => {
    expect(applyCanonicalTerms("Choose a coverage limit of Rs 5 lakh")).toContain("sum insured");
    expect(applyCanonicalTerms("What coverage amounts are there?")).toContain("sum insured");
    expect(canonicalFieldName("Name of Proposer")).toBe("customer_name");
    expect(canonicalFieldName("Applicant Name")).toBe("customer_name");
    expect(canonicalFieldName("Mobile No.")).toBe("phone");
  });

  it("annotates month durations with years so sources compare in one unit", () => {
    expect(annotateDurations("excluded until 36 months of cover")).toBe("excluded until 36 months (3 years) of cover");
    expect(annotateDurations("within 7 months")).toBe("within 7 months");
  });
});

describe("PII redaction", () => {
  it("masks contact details and removes identifiers", () => {
    const { text, findings } = redactPii(
      "Applicant Name: Rohan Mehta\nContact Number: +91 98765 43210\nEmail: rohan.mehta@example.com\nPAN: ABCPM1234K\nDOB: 12/03/1988",
    );
    expect(text).not.toMatch(/Rohan|98765|example\.com|ABCPM1234K|1988/);
    expect(new Set(findings.map((finding) => finding.type))).toEqual(new Set(["person_name", "phone", "email", "pan", "date_of_birth"]));
  });

  it("masks a named contact person in prose but leaves toll-free business numbers alone", () => {
    const { text } = redactPii("The desk lead is Priya Sharma (priya@corp.example, +91 98100 12345). Call 1800-000-0000 for quotes.");
    expect(text).toContain("[PERSON_NAME]");
    expect(text).toContain("1800-000-0000");
    expect(text).not.toContain("98100");
  });

  it("does not flag a blank form template", () => {
    expect(redactPii("Name of Proposer: ____\nDate of Birth (DD/MM/YYYY): ____").findings).toHaveLength(0);
  });

  it("recognises Indonesian and Philippine mobile formats", () => {
    expect(redactPii("hubungi 0812-3456-7890").text).toContain("[PHONE]");
    expect(redactPii("text me at 0917 123 4567").text).toContain("[PHONE]");
  });
});

describe("deduplication", () => {
  const record = (id: string, content: string, overrides: Partial<KbRecord> = {}): KbRecord => ({
    record_id: id,
    title: "t",
    section: id,
    content,
    search_text: content,
    category: "faq",
    doc_type: "faq",
    market: "in_health",
    language: "en",
    source: `${id}.html`,
    source_url: "x",
    version: "1.0",
    effective_date: "2026-04-01",
    authority: "website",
    access: "public",
    audience: "customer",
    pii: false,
    pii_findings: [],
    content_hash: id,
    metadata: {},
    ...overrides,
  });

  it("drops a chunk that is contained in a longer one and keeps the longer", () => {
    const base = "The plan can be bought on an individual basis or as a family floater covering spouse and children.";
    const longer = record("product", `${base} Minimum entry age for adults is 18 years and maximum is 65 years.`);
    const faq = record("faq", `Q: Who can buy?\nA: ${base}`);
    const { kept, dropped } = dropDuplicateChunks([faq, longer]);
    expect(kept.map((item) => item.record_id)).toEqual(["product"]);
    expect(dropped[0].reason).toBe("contained_in_other_chunk");
  });

  it("keeps the more authoritative source of an exact duplicate", () => {
    const text = "A grace period of 30 days is allowed after the renewal due date for annual premium.";
    const website = record("site", text, { content_hash: "same", authority: "website" });
    const wordings = record("pdf", text, { content_hash: "same", authority: "policy_document" });
    expect(dropDuplicateChunks([website, wordings]).kept.map((item) => item.record_id)).toEqual(["pdf"]);
  });

  it("never deduplicates across markets", () => {
    const text = "Payments made over the counter are posted within one banking day after receipt.";
    const kept = dropDuplicateChunks([record("a", text, { content_hash: "s" }), record("b", text, { content_hash: "s", market: "ph_life" })]).kept;
    expect(kept).toHaveLength(2);
  });
});

describe("taxonomy and language", () => {
  it("categorises by section before falling back to the title", () => {
    expect(categorize("script", "Lead Qualification Script", "Objection: too expensive")).toBe("objection");
    expect(categorize("script", "Lead Qualification Script", "Call recording disclosure")).toBe("compliance");
    expect(categorize("script", "Lead Qualification Script", "Closing")).toBe("script");
    expect(categorize("policy", "Wordings", "No-claim bonus")).toBe("coverage");
  });

  it("separates Taglish from pure Tagalog and English", () => {
    expect(detectLanguage("Na-late po ako sa bayad ng premium ko").language).toBe("taglish");
    expect(detectLanguage("Wala po akong pera ngayon, hindi ko kaya").language).toBe("tl");
    expect(detectLanguage("What is the grace period for my policy?").language).toBe("en");
    expect(detectLanguage("Kalau telat bayar cicilan dendanya berapa ya").language).toBe("id");
    expect(detectLanguage("Callbacks can be in Hindi or English").language).toBe("en");
  });
});
