# Design decisions

These are short ADRs. Each one gives the decision, why, and what we would change with more time or data.

## 1. Stack: one TypeScript/Node process, plain HTML pages

- **Decision:** Fastify + `@fastify/websocket`, `zod` for input validation, `cheerio` for HTML, `unpdf` for PDF text, `vitest` for tests. The pages are plain HTML and JS served by the same process.
- **Why:** It is one language end to end, and the stack we know best, so every line can be explained. Next.js would add a build step and a framework for three pages whose job is to show transcripts and nudges. Python would be the natural choice for ML-heavy retrieval, but our retrieval is small, readable TypeScript.
- **Alternatives:** Next.js + a separate API, or Python FastAPI. Both are reasonable; neither adds anything the assessment asks for.

## 2. Chunking: semantic units, not fixed windows

- **Decision:** One chunk per FAQ question with its answer, per numbered policy clause, per table group (one age band of the premium chart), per form, and per heading section of prose. Prose is split only above 180 words, at sentence boundaries, with one sentence of overlap. Every chunk's `search_text` is prefixed with `title > section`.
- **Why:**
  - A spoken answer is one to three sentences, so a chunk should be one self-contained answer unit.
  - Policy clauses carry conditions ("unless needed after an accident"). Splitting one mid-rule could produce a confident wrong answer, so clauses are never merged or split.
  - FAQ questions are kept with their answers because callers ask in the question's words.
  - Table rows become sentences ("age band: 26-35; sum insured: 10 lakh; annual premium inr: 9600") so a retrieved row reads on its own.
- **Sizes in this corpus:** 30 to 150 words. Nothing hit the 180-word split.
- **What we would change:** with long real documents, add a parent-section link so the LLM can read the whole section when a clause refers to "the above".

## 3. Retrieval: hybrid lexical, no embedding model

- **Decision:** BM25 over word tokens, plus cosine over character 3-5-gram TF-IDF. The two rankings are fused with reciprocal rank fusion (k=60). Queries get a glossary expansion for code-switched and colloquial words (bayad -> payment, cicilan -> angsuran, dereng -> belum), and the same canonical-term rewrite the documents get ("coverage amount" -> "sum insured").
- **Why not embeddings:**
  - The build sandbox could not download a model (Hugging Face blocked) or reach an embeddings API, so dense retrieval could not be measured. We did not want to ship an unmeasured component.
  - The corpus is 125 chunks.
- **Why char n-grams:**
  - They handle morphology without a stemmer per language: "mencicil" vs "cicilan", "na-late" vs "late".
  - They handle recogniser misspellings. With one letter dropped from every other long word, hybrid keeps Hit@3 at 89.7% against 77.6% for BM25 alone (`evidence/q2/retrieval_results.md`).
- **Measured:** pooled Hit@1 89.7%, Hit@3 98.3% on 58 answerable questions; hold-out Hit@1 69.2%, Hit@3 92.3%.
- **What we would change:** add a multilingual embedding model as a third ranked list in the same fusion, and a cross-encoder or LLM answerability check. This addresses the main weakness, the refusal gate, below.

## 4. Grounding contract and refusal

- **Retrieval gate:** if the character cosine between the query (minus brand names) and the top chunk is below 0.20, the bot refuses: "I don't have that information; I can connect you to an advisor." The threshold rule was fixed before the sweep: the lowest threshold that refuses at least 90% of out-of-scope questions. At 0.20, answered precision is 90.7%, answerable recall 84.5%, and out-of-scope refusal 92.9%. On the hold-out set the gate is conservative (recall 53.8%, precision 100%). We chose the safe side: a wrong refusal costs a transfer, a wrong answer costs a mis-sold policy.
- **LLM contract** (optional; Gemini, JSON mode):
  - The model may only use the numbered passages, replies in the caller's register in two spoken sentences, never promises approval, and returns `{answerable, answer, used_ids}`.
  - Code rejects the answer if `used_ids` names a chunk we did not provide, or if the answer contains a number that is in none of the passages.
  - `answerable: false` is treated as a refusal (a second, semantic gate).
  - On timeout (2.5 s) or rejection, the bot speaks the extractive answer from the same chunk.
- **Extractive mode** (default, and the fallback): the bot speaks words from the source only. That means the FAQ answer, the script's approved wording ("Say:", "Halimbawa:", "Contoh:"), or the one or two most query-relevant sentences. It cannot add a fact.
- **Citations:** every reply that used the KB carries its `chunk_ids` and full citations (`title > section [record_id] (url, version, effective date)`) in the turn log, the transcript, the lead record and the UI.

## 5. Business rules in code, not in the prompt

Qualification is decided in code: entry age 18 to 65, children to 25, required fields, pre-existing conditions sent to an underwriter, and desk hours for escalation. So are the PH grace period (31 days), the ID late fee (0.2% per day x days late) and the indicative premium lookup.

The values live in `config/*-rules.json`, and each one cites the KB section it came from. A test fails if any value disagrees with the KB text, and another fails if any spoken bot line states a number that is not in that market's KB.

The LLM never decides eligibility. It cannot change a value it never sees.

## 6. Voice pipeline

- **Decision:** browser Web Speech API for ASR and TTS. The server is text in, text out.
- **Why:**
  - It satisfies "web calling interface" with zero provider keys or cost.
  - It works in Chrome and Edge for `en-IN`, `fil-PH` and `id-ID`.
  - It keeps the server simple and testable.
- **Cost:**
  - Recognition quality and voices depend on the browser and OS.
  - There is no server-side audio, so recordings are a screen recording plus the uploaded caller side.
  - Chrome's recogniser cannot be configured for code-switching.
- **Production path:** a telephony provider (Twilio or LiveKit) streaming audio to a server-side recogniser. The same `handleTurn` would sit behind it; only the transport changes.
- **Barge-in:** off by default because of speaker echo. With headphones, the page keeps listening while the bot speaks and cancels speech on `onspeechstart`; the next turn is flagged `barged_in`.

## 7. Q4 streaming design

- **Chunks:** 250 ms of 16 kHz PCM. A chunk is released only when its audio has "happened" by the wall clock, drift-corrected against the start time.
- **Recogniser:**
  - **Simulated (default):** releases each turn's known transcript when the audio clock passes the turn's end, with partial words while it plays, and never looks ahead.
  - **Deepgram streaming:** implemented and parse-tested, but not run (no network route).
- **Signals:** rules over each final segment plus call context. Every signal is explainable by the pattern that fired, and each runs in under 2 ms (p95). Detector confidence is multiplied by the recogniser's confidence. A noisy "my parent" at ASR 0.41 becomes 0.2 and is suppressed.
- **Nudge control:**
  - confidence of at least 0.6
  - one active nudge per topic
  - a 90 s topic cooldown
  - at most 3 advisory nudges per minute (compliance and risk are exempt and do not use up the budget)
  - sales nudges suppressed while the customer is in hardship or frustrated
  - TTL expiry
  - automatic resolution when the agent's own words show they acted on it
- **Why rules and not an LLM per segment:** latency (milliseconds, not seconds), determinism (the same call gives the same nudges), and auditability for compliance. The LLM is an optional rephraser with an 800 ms timeout.

## 8. Multilingual approach (Q3)

- **Per-market packs, not translation:** each market has its own flow (premium reminder, instalment reminder), identity check, rules, KB content in its own language, and lines written for it. See `evidence/q3/localization_examples.md`.
- **Register per utterance:**
  - Philippines: Taglish by default, English when the caller is clearly speaking English.
  - Indonesia: formal by default, santai when the caller is casual, and formal again for Javanese krama or Sundanese lemes callers.
  - The register selects the line variant and the LLM instruction.
- **Code-switching:** one recogniser locale per market. Understanding uses lexicons that cover both languages (yes/no, question words, objections, hardship). Retrieval uses glossary expansion plus character n-grams, so English words in Taglish queries match English policy text, and Tagalog words match the Taglish FAQ.
- **Why not translate-then-retrieve:** it would lose the register we need to reply in, and machine translation of Taglish is unreliable. Multilingual embeddings remain the natural next step.

## 9. Code conventions

- **Files:** kebab-case. **Functions:** camelCase. **Data fields that leave the process** (records, API, logs): snake_case.
- **Errors:** throw `Error` with an identifying message (call id, path, value) inside the process. The HTTP layer maps errors to `{error: {code, message}}`, and internal details go only to the log.
- **Logs:** one JSON object per line (`src/log.ts`), carrying identifiers (call_id, chunk ids, nudge id). Never raw caller text or PII.
- **Comments** explain why, not what.
