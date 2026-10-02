# DARWIX REQUIREMENT AUDIT

This is every requirement in the assessment PDF, with what implements it, how it was tested and where the evidence is.

- **PASS** means implemented, tested, and with evidence on disk.
- **PARTIAL** means implemented and tested at some level, but a part the PDF asks for is not demonstrated. The note says which part.
- **MISSING** means not implemented.

## Question 1: Knowledge-grounded voice agent

| Requirement | Implemented | Tested | Evidence | Status | Notes |
|---|---|---|---|---|---|
| One use case | Health-insurance lead qualification | 9 scripted calls | `evidence/q1/scenario_results.md` | PASS | |
| Configure the voice platform | Browser Web Speech (ASR + TTS), `call.html` | Typed turns in headless Chromium | `evidence/q1/web_call_ui.png` | PARTIAL | Speech in and out was not exercised: no microphone in the build environment. |
| Add the provided script and business rules | Synthetic script and rules (none provided), rules in `config/health-rules.json` citing the KB | Drift-guard test | `tests/agent.test.ts`, GAPS GAP-002 | PASS (synthetic) | |
| Connect the Q2 KB; no FAQs or policies hardcoded in the prompt | `answer.ts` retrieves per turn; no prompt holds KB content | Chunk IDs logged on every KB turn | `evidence/q1/transcripts/*.md` | PASS | |
| Conversation flow | `dialogue.ts` + `markets/health.ts` | Scenarios + engine tests | transcripts | PASS | |
| Qualification logic | `decide()` in code | Scenarios q1-01, q1-03, q1-04, q1-07 | transcripts, lead JSON in each transcript | PASS | |
| Grounded objection handling | Objection category retrieval, approved wording | q1-02, q1-09 | transcripts | PASS | |
| Unsupported-question fallback | Refusal gate + fallback line | q1-05 | `q1-05-out-of-scope.md` | PASS | |
| Human escalation | Request, two unanswered questions, three unclear turns; desk-hours rule; webhook | q1-05, q1-06 | transcripts | PASS | The webhook is called only when `ESCALATION_WEBHOOK_URL` is set. Not exercised against a live endpoint. |
| Callable number or web calling interface | `/call.html` | UI smoke test | `web_call_ui.png` | PARTIAL | Web interface works with typed turns. A voice call through it is not yet recorded. |
| At least 3 recorded test calls with transcripts and results | 9 health calls | | `evidence/audio/q1-*.ogg`, transcripts | PARTIAL | The recordings are synthetic TTS renders of scripted calls, not calls through the voice interface. |
| Coverage: cooperative, objection, incomplete or conflicting, out-of-scope, human request | q1-01 / q1-02 / q1-03, q1-04 / q1-05 / q1-06 | Scenario expectations | `scenario_results.md` | PASS | |
| States when information is unavailable instead of inventing | Gate + extractive-only or LLM citation and number checks | q1-05; LLM guard unit tests | transcripts, `tests/agent.test.ts` | PASS | |
| Optional business action | Lead record (mock CRM) + escalation webhook | Every scenario writes one | `runtime/leads/*.json` (generated); outcome block in transcripts | PASS | |
| Latency measured | Per-hop timing per turn | 86 turns | `evidence/q1/latency.md` | PARTIAL | Server-side hops measured. ASR, TTS and LLM n/a (no microphone, no key). |

## Question 2: Production-ready knowledge base

| Requirement | Implemented | Tested | Evidence | Status | Notes |
|---|---|---|---|---|---|
| Input types: web pages, product/marketing, policy/rules, forms, tables, PDFs, duplicates, inconsistent terms, PII | Corpus in `data/raw` covers each one | Ingestion tests | `docs/knowledge-base.md` table | PASS (synthetic) | GAP-001 |
| Explain website extraction and document parsing | `extract.ts` | Ingestion tests | `docs/knowledge-base.md` | PASS | |
| Remove navigation, headers, footers, repeated sections, irrelevant content | Tag stripping, PDF running-header detection, cross-page boilerplate | Test asserts no chrome text in any record | `tests/ingestion.test.ts` | PASS | |
| Handle extraction failures | Scanned PDF reported | Test | ingest report | PASS | |
| Flag obvious source errors | Fact consistency check | Test (brochure 4 years vs policy 36 months) | ingest report | PASS | |
| Remove duplicate and near-duplicate information | Document hash, boilerplate, trigram Jaccard + containment | Unit + integration tests | ingest report | PASS | |
| Standardise headings, dates, terminology, categories, form fields | `normalize.ts`, `glossary.json`, `taxonomy.ts` | Unit tests | `tests/kb.test.ts` | PASS | |
| Identify and protect PII | `pii.ts` policy table; customer records excluded; transcripts masked | Unit + integration tests | `docs/knowledge-base.md` | PASS | |
| Schema and sample records | `KbRecord` | | `docs/knowledge-base.md` | PASS | |
| Chunking strategy and metadata | `chunk.ts` | Unit tests | `docs/decisions.md` section 2 | PASS | |
| Taxonomy and source tracking | Category, doc type, authority, audience, source URL | | `docs/knowledge-base.md` | PASS | |
| Versioning | Version, effective date, `superseded_by`, status | Test: superseded never retrieved | `tests/ingestion.test.ts` | PASS | |
| Embedding/indexing, retrieval/ranking logic | Hybrid lexical + RRF; no embeddings (reason documented) | Eval + ablation | `retrieval_results.md` | PASS | Dense retrieval not implemented; this is a stated choice. |
| Citation method | Citation string on every hit; chunk IDs in every KB turn | Test checks citation format | transcripts | PASS | |
| At least 5 queries with question, chunk, source, relevance, verdict | Five types + refusal + known failure | | `evidence/q2/five_queries.md` | PASS | |
| Connected to Q1 bot or a retrieval interface | Both: voice bot, dashboard search, `/api/knowledge/search`, CLI | | `dashboard_ui.png` | PASS | |
| Answers for product, policy, qualification, FAQ, objection | | | `five_queries.md` | PASS | |

## Question 3: Native-language voice bots

| Requirement | Implemented | Tested | Evidence | Status | Notes |
|---|---|---|---|---|---|
| Philippines: life insurance or bancassurance | Kalinga Life via Bayanihan Bank, premium reminder | 5 calls | `q3/transcripts/q3-ph-*` | PASS | |
| English, Filipino/Tagalog, natural Taglish | Taglish and English registers; Tagalog understood | Language eval + scenarios | `language_eval.md` | PARTIAL | A pure-Tagalog reply register is not separate; Tagalog callers get Taglish, as PH agents typically use. |
| PH terms used naturally | premium, policy, beneficiary, rider, lapse, coverage, bank referral in KB and lines | | `localization_examples.md` | PASS | |
| Indonesia: multifinance | Danamaju motorcycle financing, pre-due reminder | 4 calls | `q3/transcripts/q3-id-*` | PASS | |
| Formal and colloquial Bahasa, loanwords | Formal/santai registers; DP, tenor, m-banking understood | Language eval | `language_eval.md` | PASS (text level) | |
| At least one regional accent outside Jakarta | Javanese krama and Sundanese lemes vocabulary handled | Scenarios q3-id-03, -04 | transcripts | PARTIAL | Vocabulary only. Accent recognition needs real speakers (GAP-008). |
| ID terms used naturally | cicilan, tenor, denda, DP, jatuh tempo, angsuran, pembiayaan | | KB + lines | PASS | |
| Language-specific ASR configured and tested per market | `fil-PH`, `id-ID` configured | Not tested with speech | `asr_tts_report.md` | PARTIAL | Provider and locale reported. Quality, errors and accent performance UNTESTED. |
| Localised design: scripts, FAQs, objections, rules, politeness, dates, amounts, payments | Per-market packs, KB and rules | Scenarios, unit tests for dates and amounts | `localization_examples.md` | PASS | Not reviewed by native speakers (GAP-005). |
| At least 3 localisation examples per market | 5 per market | | `localization_examples.md` | PASS | |
| Native TTS where possible; document compromises | `fil-PH` / `id-ID` browser voices with fallback reporting | | `asr_tts_report.md` | PARTIAL | Voice quality not evaluated. Test audio uses espeak (Indonesian voice for Tagalog). |
| Fallback and escalation stay in the caller's language and register | Every line has every register | q3-ph-04 (English), q3-id-04 (formal) | transcripts | PASS | Exception: in extractive mode, objection wording is in the script's language (Taglish) even for an English-register caller. |
| Coverage: cooperative, sector objection, mixed English/finance terms, colloquial, human escalation, Indonesian regional accent | Scenarios per item | | `scenario_results.md` | PARTIAL | All covered as text; regional accent not as audio. |
| Two recorded calls per market | 5 PH, 4 ID | | `audio/q3-*.ogg` | PARTIAL | Synthetic renders, not native speakers. |
| Configurations, terminology, code-switching behaviour, accent observations, comparison, known gaps | | | `asr_tts_report.md`, `localization_examples.md`, GAPS | PARTIAL | Code-switching at text level only; accent observations pending. |

## Question 4: Live insights and nudges

| Requirement | Implemented | Tested | Evidence | Status | Notes |
|---|---|---|---|---|---|
| Streaming input: live audio or recording at real-time speed in chunks | 250 ms chunks, wall-clock paced; live mic mode | Pacing unit test; 1x runs | `latency.md`, `live_demo.webm` | PASS | |
| Streaming transcription, agent/customer separation, latency per chunk | Simulated diarised recogniser; Deepgram adapter | Never-ahead test; Deepgram parse test | `latency.md` | PARTIAL | Recognition is simulated; the Deepgram path is UNTESTED (GAP-009). |
| Signals: topic shifts, compliance/risk, sentiment/frustration, buying, missed opportunities, callback | `signals.ts` + topic and sentiment insights | Unit tests + labelled calls | `nudge_precision.md` | PASS | |
| Nudges via dashboard, WebSocket, webhook, polling or CLI | WebSocket to `live.html`; CLI runner | | `live_demo.webm`, `runs/*.jsonl` | PASS | |
| End-to-end latency with P50/P95 and components (ASR, signal, LLM, delivery) | Timestamps per nudge | 16 nudges at 1x | `latency.md` | PARTIAL | ASR simulated; LLM off (its failure path measured separately). |
| Nudge control | Threshold, dedupe, cooldown, rate cap, priority, expiry, resolution, context suppression | Unit tests per control | `nudge_precision.md` | PASS | |
| Approximate false-positive analysis | TP/FP/missed with run history | | `nudge_precision.md`, `evidence/README.md` | PASS | Small author-written set. |
| Coverage: missed cross-sell, skipped disclosure or risky statement, rising frustration, noisy call | Each in a labelled call | | `nudge_precision.md` | PASS | The noisy call uses authored recogniser confidences. |
| At least one compliance and one missed-opportunity example | Several of each | | `live_q4-*.png` | PASS | |
| Limitations at 10x scale and with noisy audio | | | `docs/scaling-and-cost.md` | PASS | |
| Recorded live demo | Screen recording of a real-time replay | | `live_demo.webm` | PASS | Video only; a narrated walkthrough is still to be recorded. |

## Submission package

| Requirement | Status | Notes |
|---|---|---|
| Repository with README and environment template | PASS | `README.md`, `.env.example` |
| Architecture diagram, setup, sample inputs, test results | PASS | `docs/architecture.md` (Mermaid), `data/`, `evidence/` |
| Recorded voice calls, transcripts, audio samples | PARTIAL | Synthetic renders and transcripts; real calls to do |
| Video walkthrough | MISSING | Needs the candidate on camera. The README lists what to cover. |
| Known limitations and production plan | PASS | README, `docs/scaling-and-cost.md` |
| No credentials, keys, secrets or customer information committed | PASS | Secret scan in the final check; all data synthetic; `runtime/` and `.env` ignored |

## Summary

- **PASS:** knowledge base end to end; voice-agent logic, grounding and fallback; Q4 pipeline, controls and analysis.
- **PARTIAL:** everything that needs real speech, the real LLM or a real streaming recogniser. The code paths exist and the failure paths are tested, but quality and latency with real audio are not measured.
- **MISSING:** the video walkthrough.
