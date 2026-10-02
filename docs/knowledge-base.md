# Knowledge base design (Q2)

## Pipeline

`npm run ingest` runs `src/kb/ingest.ts`. Every step below leaves a trace in `data/processed/ingest-report.json`.

| Step | What it does | Where |
|---|---|---|
| Source registry | Every file is listed in `data/raw/sources.json` with its URL, market, document type, authority, access level, audience and (optionally) `superseded_by`. Provenance comes from the registry, never from file names. | `sources.json` |
| Extraction | **HTML** (cheerio): drops `nav`, `header`, `footer`, scripts and the cookie banner, then walks `h1-h3`, `p`, `li` keeping the heading path, and marks FAQ blocks. **PDF** (unpdf): text per page; lines repeated on 60% or more of pages, with digits masked, are running headers and footers ("Page 3 of 5"); numbered clauses become blocks. **Markdown**: heading paths, FAQ detection, version and date lines lifted into metadata. **CSV**: rows grouped by the first column, written as sentences. **Forms**: label/value pairs. | `extract.ts` |
| Extraction failures | Under 40 characters of text is a failure with a reason ("likely scanned, needs OCR"). It is reported and does not stop the run. | `extract.ts` |
| Customer records | Filled-in forms (`doc_type: form_submission`) are not knowledge. They are excluded, and only a keyed hash (HMAC-SHA256 of the phone number) and the PII types found are reported. | `ingest.ts`, `pii.ts` |
| Duplicate documents | Mirror pages with identical extracted text are collapsed. | `dedup.ts` |
| Boilerplate | A block on 3 or more pages and at least half of a market's site is removed (the "Talk to an advisor" CTA). | `dedup.ts` |
| Chunking | See `decisions.md` section 2. | `chunk.ts` |
| Normalisation | Section paths without clause numbers or the repeated title. Dates in ISO (DD/MM/YYYY, "1 April 2026", "Last reviewed ..."). Canonical terms in `search_text` ("cover amount", "coverage limit" -> "sum insured"; "cicilan" -> "angsuran"). Form labels mapped to canonical fields ("Name of Proposer", "Applicant Name" -> `customer_name`). Month durations annotated in years ("36 months (3 years)"). Lakh amounts annotated in rupees. `content` keeps the source wording; only `search_text` is rewritten. | `normalize.ts`, `glossary.json` |
| PII | Detected and handled per the policy table below, before anything is stored. | `pii.ts` |
| Categorisation | Taxonomy from section headings first, then document type (titles only for product pages). | `taxonomy.ts` |
| Near-duplicates | Exact hash, word-trigram Jaccard of 0.85 or more, or containment of 0.9 or more (a short FAQ answer pasted inside a longer product section). The survivor is chosen by authority, then newer effective date, then more text. Never across markets. | `dedup.ts` |
| Consistency | Facts that must agree across sources (pre-existing disease waiting period, grace period, free-look, entry age, late fee) are extracted with patterns. Disagreements are reported, the most authoritative and newest value wins, and the losing chunks are marked `superseded`. | `consistency.ts` |
| Index | Built in memory from active records at process start (about 80 ms). | `search.ts` |

Ingestion is idempotent. Record IDs are derived from source path, section and position, not from a counter. `tests/ingestion.test.ts` runs the pipeline twice and compares the bytes.

## What the sample corpus exercises

| Input type from the brief | File | What the pipeline does with it |
|---|---|---|
| Web pages with navigation, headers, footers | `health/website/*.html`, `ph/...`, `id/...` | Chrome stripped; CTA block removed as boilerplate on 5 pages |
| Product and marketing content | `family-shield.html`, `top-up-and-addons.html`, `kalinga-protect.html`, `pembiayaan-motor.html` | Chunked per section |
| Policy and qualification rules | `qualification-rules.md`, `payment-lapse-reinstatement.md`, `denda-keringanan-penagihan.md` | Chunked per rule; also the source cited by `config/*-rules.json` |
| PDF with running header and footer | `family-shield-policy-wordings.pdf` | Header and footer removed; one chunk per clause |
| Scanned PDF | `scanned-claim-form.pdf` | Reported as an extraction failure (needs OCR) |
| Table | `family-shield-premium-chart.csv` | One chunk per age band, as sentences; also read directly by the quote rule |
| Form (blank) | `web-enquiry-form.txt` | Field schema with canonical names |
| Form with PII (filled) | `submitted-enquiry-0914.txt` | Excluded as a customer record; hash only |
| PII inside useful content | `sales-desk-notes.md` | Name, email and phone masked; the rest kept |
| Duplicated material | `help-faq-mirror.html`, and the FAQ answers repeated from product and claims pages | Mirror dropped; 2 contained chunks dropped |
| Inconsistent terminology | "cover amount", "coverage limit", "sum insured"; "cicilan" vs "angsuran"; "36 months" vs "3 years" | Canonical terms and unit annotation |
| Obvious source error | `brochure-2024.html` says 4 years for pre-existing diseases; the policy says 36 months | Flagged by the consistency check; the brochure is retired via `superseded_by` |

## PII policy

| Type | Action | Reason |
|---|---|---|
| Email, phone, person name, pin code | masked (`[EMAIL]`, `[PHONE]`, ...) | The sentence still reads; the value is gone |
| Date of birth, PAN, Aadhaar, NIK | removed | Identifiers with no use in a knowledge base |
| Customer records (filled forms) | excluded entirely; HMAC lead reference kept | They are data about a person, not knowledge |
| Call transcripts | caller text and known account values masked before writing to disk | Whole-word matching so "Ana" does not damage "pinagdadaanan" |
| Logs | identifiers only (call_id, chunk IDs) | Never caller text |

Data stays out of git: `runtime/` (calls, leads, recordings) and `data/processed/` are ignored. All people and companies in `data/raw` are fictional.

## Schema and sample records

```json
{
  "record_id": "kb_in_health_exclusions_d3c891",
  "title": "Family Shield Policy Wordings",
  "section": "Permanent Exclusions",
  "content": "4.1 The company shall not be liable for expenses arising from cosmetic or plastic surgery unless needed after an accident or burn, ...",
  "search_text": "family shield policy wordings > permanent exclusions\n4.1 the company shall not be liable ...",
  "category": "exclusions",
  "doc_type": "policy",
  "market": "in_health",
  "language": "en",
  "source": "health/pdf/family-shield-policy-wordings.pdf",
  "source_url": "https://suraksha-example.in/docs/family-shield-policy-wordings.pdf",
  "version": "1.0",
  "effective_date": "2026-04-01",
  "authority": "policy_document",
  "access": "public",
  "audience": "customer",
  "pii": false,
  "pii_findings": [],
  "content_hash": "c8be23da...",
  "metadata": { "chunk_kind": "clause", "status": "active", "synthetic": true }
}
```

```json
{
  "record_id": "kb_in_health_operations_a92353",
  "title": "Sales Desk Operating Notes",
  "section": "Escalation desk",
  "content": "Calls that need a human advisor are transferred to the senior advisor desk, available Monday to Saturday from 9 am to 8 pm IST. ... the desk lead is [PERSON_NAME] ([EMAIL], [PHONE]).",
  "category": "operations",
  "authority": "internal_policy",
  "access": "internal",
  "audience": "agent",
  "effective_date": "2026-05-10",
  "pii": true,
  "pii_findings": [{ "type": "person_name", "action": "masked" }, { "type": "email", "action": "masked" }, { "type": "phone", "action": "masked" }]
}
```

### Fields

- **`audience`:** separates what the bot may say to a caller (`customer`) from instructions for the agent (`agent`: scripts, underwriting rules, desk notes). Customer questions search customer records; objections search the agent-facing objection scripts, whose approved wording is what gets spoken.
- **`authority`:** `policy_document` > `internal_policy` > `website` > `marketing`. Used by deduplication and conflict resolution.
- **`status`:** `active` or `superseded`, set either by the registry (`superseded_by`) or by a lost conflict. Superseded records are kept for audit and never retrieved.

### Taxonomy

product, eligibility, coverage, waiting_period, exclusions, pricing, payment, claims, faq, objection, compliance, escalation, form, operations, cross_sell, script.

### Versioning

- Each record carries `version` and `effective_date` from the source.
- When a policy changes, the new file is added to the registry and the old one gets `superseded_by`. Both are ingested, conflicts are reported, and only the new one is retrieved.
- Answers cite the version they used.

## Retrieval and ranking

See `decisions.md` sections 3 and 4. Results are in `evidence/q2/`:

- `retrieval_results.md`: metrics, per-language table, ablation, threshold sweep, hold-out set, robustness to misspellings.
- `five_queries.md`: the five required query types.
- `failure_analysis.md`: every miss, by root cause.
