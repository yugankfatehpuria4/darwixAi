import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { applyCanonicalTerms, detectLanguage } from "../text";
import { chunkDocument } from "./chunk";
import { findConflicts, type FactConflict } from "./consistency";
import { contentHash, dropBoilerplateBlocks, dropDuplicateChunks, dropDuplicateDocuments, type DroppedItem } from "./dedup";
import { ExtractionError, extractDocument } from "./extract";
import { annotateDurations, annotateIndianAmounts } from "./normalize";
import { hashedReference, redactPii } from "./pii";
import { categorize } from "./taxonomy";
import type { ExtractedDocument, KbRecord, SourceEntry } from "./types";

export const RAW_DIR = path.resolve("data/raw");
export const PROCESSED_DIR = path.resolve("data/processed");
export const KB_PATH = path.join(PROCESSED_DIR, "kb.json");

export interface IngestReport {
  generated_at: string;
  sources_registered: number;
  documents_extracted: number;
  extraction_failures: Array<{ source: string; error: string }>;
  excluded_customer_records: Array<{ source: string; lead_ref: string; pii_types: string[] }>;
  dropped: DroppedItem[];
  pii_redactions: Array<{ record_id: string; types: string[] }>;
  conflicts: FactConflict[];
  records_total: number;
  records_active: number;
  records_by_market: Record<string, number>;
  records_by_category: Record<string, number>;
}

async function loadRegistry(): Promise<SourceEntry[]> {
  const registry = JSON.parse(await readFile(path.join(RAW_DIR, "sources.json"), "utf8"));
  return registry.sources;
}

function recordId(source: SourceEntry, category: string, section: string, index: number): string {
  // Derived from position, not from a counter, so re-running ingestion on
  // unchanged sources yields identical IDs (and identical citations).
  const suffix = contentHash(`${source.path}|${section}|${index}`).slice(0, 6);
  return `kb_${source.market}_${category}_${suffix}`;
}

function toRecords(document: ExtractedDocument): KbRecord[] {
  const { source } = document;
  return chunkDocument(document).map((chunk, index) => {
    // The H1 usually repeats the title; keeping it would make every citation
    // read "FAQ > FAQ > question".
    const headings = chunk.section.split(" > ");
    const section = (headings[0] === document.title ? headings.slice(1) : headings).join(" > ");
    const category = categorize(source.doc_type, document.title, section);
    const redaction = redactPii(chunk.content);
    const language = source.market === "id_finance" ? "id" : detectLanguage(redaction.text).language;
    const header = section ? `${document.title} > ${section}` : document.title;
    return {
      record_id: recordId(source, category, section, index),
      title: document.title,
      section,
      content: redaction.text,
      search_text: annotateIndianAmounts(annotateDurations(applyCanonicalTerms(`${header}\n${redaction.text}`))),
      category,
      doc_type: source.doc_type,
      market: source.market,
      language,
      source: source.path,
      source_url: source.source_url,
      version: document.version,
      effective_date: document.effective_date,
      authority: source.authority,
      access: source.access,
      audience: source.audience ?? (source.access === "public" ? "customer" : "agent"),
      pii: redaction.findings.length > 0,
      pii_findings: redaction.findings,
      content_hash: contentHash(redaction.text),
      metadata: {
        chunk_kind: chunk.kind,
        status: source.superseded_by ? "superseded" : "active",
        ...(source.superseded_by ? { superseded_by: source.superseded_by } : {}),
        synthetic: true,
      },
    };
  });
}

function countBy(records: KbRecord[], key: (record: KbRecord) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const record of records) counts[key(record)] = (counts[key(record)] ?? 0) + 1;
  return counts;
}

export async function runIngestion(): Promise<{ records: KbRecord[]; report: IngestReport }> {
  const registry = await loadRegistry();
  const extracted: ExtractedDocument[] = [];
  const failures: IngestReport["extraction_failures"] = [];
  const excluded: IngestReport["excluded_customer_records"] = [];

  for (const source of registry) {
    try {
      const document = await extractDocument(source, path.join(RAW_DIR, source.path));
      if (source.doc_type === "form_submission") {
        // A filled-in customer form is a customer record, not knowledge.
        const fields = document.blocks.map((block) => block.text).join("\n");
        const phone = fields.match(/(?:Contact Number|Mobile No\.?|Phone)\s*:\s*(.+)/i)?.[1] ?? source.path;
        excluded.push({
          source: source.path,
          lead_ref: hashedReference(phone),
          pii_types: [...new Set(redactPii(fields).findings.map((finding) => finding.type))],
        });
        continue;
      }
      extracted.push(document);
    } catch (error) {
      if (!(error instanceof ExtractionError)) throw error;
      failures.push({ source: source.path, error: error.message });
    }
  }

  const documents = dropDuplicateDocuments(extracted);
  const boilerplate = dropBoilerplateBlocks(documents.kept);
  const chunks = dropDuplicateChunks(documents.kept.flatMap(toRecords));
  const conflicts = findConflicts(chunks.kept);
  const superseded = new Set(conflicts.flatMap((conflict) => conflict.superseded_record_ids));
  const records = chunks.kept.map((record) =>
    superseded.has(record.record_id) ? { ...record, metadata: { ...record.metadata, status: "superseded" } } : record,
  );

  const report: IngestReport = {
    generated_at: new Date().toISOString(),
    sources_registered: registry.length,
    documents_extracted: extracted.length,
    extraction_failures: failures,
    excluded_customer_records: excluded,
    dropped: [...documents.dropped, ...boilerplate, ...chunks.dropped],
    pii_redactions: records
      .filter((record) => record.pii)
      .map((record) => ({ record_id: record.record_id, types: record.pii_findings.map((finding) => finding.type) })),
    conflicts,
    records_total: records.length,
    records_active: records.filter((record) => record.metadata.status === "active").length,
    records_by_market: countBy(records, (record) => record.market),
    records_by_category: countBy(records, (record) => record.category),
  };

  await mkdir(PROCESSED_DIR, { recursive: true });
  await writeFile(KB_PATH, JSON.stringify(records, null, 2));
  // generated_at is the only field that changes between identical runs.
  await writeFile(path.join(PROCESSED_DIR, "ingest-report.json"), JSON.stringify(report, null, 2));
  return { records, report };
}
