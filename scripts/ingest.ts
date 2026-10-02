import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { KB_PATH, runIngestion } from "../src/kb/ingest";

const before = await readFile(KB_PATH, "utf8").catch(() => null);
const { records, report } = await runIngestion();
const after = await readFile(KB_PATH, "utf8");
const digest = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 12);

console.log(`sources registered:   ${report.sources_registered}`);
console.log(`documents extracted:  ${report.documents_extracted}`);
console.log(`extraction failures:  ${report.extraction_failures.length}`);
for (const failure of report.extraction_failures) console.log(`  - ${failure.source}: ${failure.error}`);
console.log(`customer records excluded: ${report.excluded_customer_records.length}`);
for (const excluded of report.excluded_customer_records) {
  console.log(`  - ${excluded.source}: lead_ref=${excluded.lead_ref}, pii found: ${excluded.pii_types.join(", ")}`);
}
console.log(`dropped items:        ${report.dropped.length}`);
for (const dropped of report.dropped) console.log(`  - [${dropped.reason}] ${dropped.source}: ${dropped.detail}`);
console.log(`records with PII redacted: ${report.pii_redactions.length}`);
for (const redaction of report.pii_redactions) console.log(`  - ${redaction.record_id}: ${redaction.types.join(", ")}`);
console.log(`conflicts:            ${report.conflicts.length}`);
for (const conflict of report.conflicts) {
  const values = conflict.values.map((entry) => `${entry.value} (${entry.source})`).join(" vs ");
  console.log(`  - ${conflict.fact}: ${values} -> using ${conflict.resolved_value}; superseded ${conflict.superseded_record_ids.join(", ")}`);
}
console.log(`records: ${report.records_total} total, ${report.records_active} active`);
console.log(`by market:   ${JSON.stringify(report.records_by_market)}`);
console.log(`by category: ${JSON.stringify(report.records_by_category)}`);
console.log(`kb.json sha256 ${digest(after)}${before === null ? " (first run)" : before === after ? " (unchanged from previous run)" : " (changed from previous run)"}`);
console.log(`record ids: ${records.length} (${new Set(records.map((record) => record.record_id)).size} unique)`);
