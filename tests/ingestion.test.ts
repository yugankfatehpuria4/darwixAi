import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { KB_PATH, runIngestion } from "../src/kb/ingest";
import { resetIndex, search } from "../src/kb/search";

// These run the real pipeline over data/raw, so they double as a regression
// check on the corpus: if a source edit breaks extraction, this fails.
describe("ingestion over the sample corpus", () => {
  it("is idempotent: two runs produce byte-identical kb.json", async () => {
    await runIngestion();
    const first = createHash("sha256").update(await readFile(KB_PATH)).digest("hex");
    await runIngestion();
    const second = createHash("sha256").update(await readFile(KB_PATH)).digest("hex");
    expect(second).toBe(first);
  });

  it("reports the scanned PDF as an extraction failure and excludes the customer record", async () => {
    const { report, records } = await runIngestion();
    expect(report.extraction_failures.map((failure) => failure.source)).toEqual(["health/pdf/scanned-claim-form.pdf"]);
    expect(report.excluded_customer_records[0].source).toBe("health/forms/submitted-enquiry-0914.txt");
    expect(records.some((record) => record.source.includes("submitted-enquiry"))).toBe(false);
    expect(JSON.stringify(records)).not.toMatch(/Rohan|98765 43210|ABCPM1234K|98100 12345/);
  });

  it("flags the outdated brochure's waiting period as a conflict and keeps it out of retrieval", async () => {
    const { report, records } = await runIngestion();
    const conflict = report.conflicts.find((entry) => entry.fact.startsWith("pre-existing disease"));
    expect(conflict?.resolved_value).toBe("3");
    const brochure = records.filter((record) => record.source.endsWith("brochure-2024.html"));
    expect(brochure.length).toBeGreaterThan(0);
    expect(brochure.every((record) => record.metadata.status === "superseded")).toBe(true);
  });

  it("strips site chrome: no nav, cookie or CTA text in any record", async () => {
    const { records } = await runIngestion();
    const all = records.map((record) => record.content).join("\n");
    expect(all).not.toMatch(/Customer Login|Accept all|Get a free quote in 2 minutes|All rights reserved/);
  });
});

describe("retrieval", () => {
  it("returns a cited chunk for an answerable question", () => {
    resetIndex();
    const result = search("Is cosmetic surgery covered?", { market: "in_health" });
    expect(result.answerable).toBe(true);
    expect(result.hits[0].record.section).toBe("Permanent Exclusions");
    expect(result.hits[0].citation).toMatch(/Family Shield Policy Wordings > Permanent Exclusions \[kb_in_health_exclusions_[0-9a-f]{6}\]/);
  });

  it("refuses an out-of-scope question instead of returning the nearest chunk", () => {
    const result = search("Do you sell travel insurance for my Europe trip?", { market: "in_health" });
    expect(result.answerable).toBe(false);
    expect(result.reason).toMatch(/below/);
  });

  it("only returns chunks from the requested market", () => {
    const result = search("what is the grace period", { market: "ph_life", topK: 10 });
    expect(result.hits.every((hit) => hit.record.market === "ph_life")).toBe(true);
  });

  it("never retrieves superseded records", () => {
    const result = search("pre-existing disease waiting period 4 years", { market: "in_health", topK: 20 });
    expect(result.hits.some((hit) => hit.record.source.endsWith("brochure-2024.html"))).toBe(false);
  });
});
