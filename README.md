# Darwix voice AI: grounded voice agents, localized bots, live call nudges

This is a working submission for the Darwix AI Engineer Assessment. Four parts share one knowledge base and one retriever:

| Part | What it is |
|---|---|
| Q2: Knowledge base | Mixed business content (HTML, PDF, CSV, forms, scripts) turned into 125 cited, versioned, PII-safe records with hybrid retrieval and a refusal gate |
| Q1: Voice agent | Health-insurance lead qualification over a web call. Questions and objections are answered from the KB, eligibility is decided in code, and the lead is written out with its reasons |
| Q3: Native-language bots | A Philippine life-insurance premium reminder (Taglish/English) and an Indonesian motorcycle-finance instalment reminder (formal and casual Bahasa, Javanese/Sundanese vocabulary). Both run on the same engine |
| Q4: Live nudges | Call audio streamed in real-time chunks. Rule-based signals, controlled and KB-grounded nudges pushed to the agent's screen over WebSocket while the call is still playing |

**All business content is synthetic.** No business material came with the assessment, so we wrote a corpus for three fictional companies that deliberately contains every input problem the brief lists (GAPS.md GAP-001). Swap in real material by listing it in `data/raw/sources.json` and running `npm run ingest`.

## Results at a glance

Every number here was produced by a script in this repo; the evidence files show the method and sample size.

| What | Result | Evidence |
|---|---|---|
| Retrieval, 58 answerable questions in 3 markets | Hit@1 89.7%, Hit@3 98.3%, MRR 0.934 | `evidence/q2/retrieval_results.md` |
| Retrieval, hold-out written after tuning (13 answerable) | Hit@1 69.2%, Hit@3 92.3% | same |
| Out-of-scope questions refused | 92.9% (14) main set, 100% (4) hold-out | same |
| Scripted calls (9 Q1, 9 Q3) | 18/18 pass on outcome, intents and KB use | `evidence/q1/scenario_results.md` |
| Q3 understanding (register, intent, slot), 26 utterances | 26/26 (24/26 on first run; two fixes documented) | `evidence/q3/language_eval.md` |
| Q4 nudges, 5 labelled calls at 1x real time | 16/16 expected, 0 false positives, cross-sell held back during hardship, 0 nudges on the noisy call | `evidence/q4/nudge_precision.md` |
| Q4 audio received to nudge on client | p95 5 ms **excluding speech recognition** (simulated) | `evidence/q4/latency.md` |
| Voice turn, server side | p95 3 ms; ASR, TTS and LLM latency not measured (see Limitations) | `evidence/q1/latency.md` |
| Tests | 60 passing (unit, integration over the real corpus, LLM guardrails, rule-drift guard) | `npm test` |

## Architecture

```text
data/raw (HTML, PDF, CSV, forms, scripts)
   |  npm run ingest: extract, strip chrome, PII, dedupe, chunk, categorise, conflict check
   v
kb.json (125 records) -> hybrid index (BM25 + char n-gram, RRF, refusal gate)
   ^                              ^
   | questions / objections       | KB grounding for nudges
Browser web call --text--> dialogue engine + market pack --rules in code--> outcome, lead, webhook
  (Web Speech ASR/TTS)            (health | Philippines | Indonesia)
Recording / live mic --250 ms chunks--> streaming ASR --> signals --> nudge control --WebSocket--> agent screen
```

The full diagram with failure modes and latency budgets is in [docs/architecture.md](docs/architecture.md).

## Technology choices

| Choice | Why | Considered | Trade-off |
|---|---|---|---|
| TypeScript, Node 22, Fastify, plain HTML pages | One language, small surface, every line explainable | Next.js frontend; Python FastAPI | Less UI polish; no SSR (not needed) |
| Hybrid lexical retrieval (BM25 + char 3-5-gram TF-IDF, RRF) | Measurable here; handles Tagalog/Indonesian morphology and ASR misspellings (Hit@3 89.7% vs 77.6% for BM25 under misspellings) | Embeddings + vector DB (no model or API reachable in the build sandbox) | Weaker on paraphrases; the refusal gate is conservative |
| Rules in code, values cited from the KB | Eligibility must be auditable; a test catches drift | LLM decides qualification | More code per market |
| Gemini (optional), JSON output, citation and number checks, extractive fallback | Natural phrasing without trusting the model with facts | LLM always on | Phrasing in extractive mode is the source's wording |
| Browser Web Speech API | Web calling interface with no keys, for `en-IN`, `fil-PH`, `id-ID` | Twilio/LiveKit + server ASR | Quality depends on the browser; no server-side audio |
| Rule-based Q4 signals | Milliseconds, deterministic, auditable | LLM per segment | Pattern coverage must be maintained |
| Simulated streaming ASR for replays; Deepgram adapter | Honest stand-in that never runs ahead of the audio | | Real recognition latency not measured |

There is a full ADR for each choice in [docs/decisions.md](docs/decisions.md).

## Setup

Requires Node 22 or newer. Python 3 is only needed to re-render test audio.

```bash
npm install
cp .env.example .env      # optional; everything works with no keys
npm run ingest            # builds data/processed/kb.json and ingest-report.json
npm test                  # 60 tests
npm start                 # http://127.0.0.1:3000 (re-ingests first, about 1 s)
```

### Pages

| Page | What to do there |
|---|---|
| `/call.html` | Start a Q1 or Q3 call; speak (Chrome or Edge) or type. Every reply shows the KB chunk IDs it used. `?typed` turns the microphone off. |
| `/dashboard.html` | Search the KB directly; open any finished call to see its transcript, retrieval trace, outcome and latency. |
| `/live.html` | Replay a Q4 call at real-time speed and watch nudges arrive, or analyse a live microphone conversation. |

### Environment variables

See `.env.example`. All are optional:

- `GEMINI_API_KEY` turns on LLM phrasing.
- `ASR_MODE=deepgram` with `DEEPGRAM_API_KEY` switches Q4 replays to real streaming recognition (untested here).
- `DEMO_ACCESS_TOKEN` protects the API.
- `ESCALATION_WEBHOOK_URL` receives transfers.
- `PII_HASH_KEY` keys the customer-record hash.

## Testing and evaluation

```bash
npm test                 # unit + integration (expected: 60 passed)
npm run eval             # retrieval eval, Q3 language eval, 18 scripted calls, latency report
npm run search -- "is cosmetic surgery covered" --market in_health
npm run q4               # Q4: 5 calls at real-time speed through server + WebSocket (~2 min)
npm run ui:smoke         # drives the web call and dashboard in headless Chromium (CHROME_PATH)
npm run record:demo      # screen-records live.html during two Q4 replays
npm run render:audio     # re-renders call audio with espeak-ng (pip install espeakng-loader numpy)
```

Expected output: `npm run eval` ends with `18/18 scenarios passed`, and `npm run q4` prints the precision table with 0 false positives.

## Evidence

[evidence/README.md](evidence/README.md) maps every file to the requirement it supports. The final requirement-by-requirement check is [DARWIX_REQUIREMENT_AUDIT.md](DARWIX_REQUIREMENT_AUDIT.md). The six-question defence per component is in [DEFENSE.md](DEFENSE.md), and everything we did not have is in [GAPS.md](GAPS.md).

## Known limitations

- **No real speech has gone through the system.** The build sandbox had no microphone and no route to Google or Deepgram.
  - ASR and TTS quality, Taglish and accent recognition, and end-to-end voice latency are UNTESTED.
  - The "recordings" in `evidence/audio` are robotic espeak-ng renders of the scripted calls, both sides synthetic, made so the flow can be heard and Q4 has audio to stream.
  - Real browser calls are the first thing to do; see "What to run before the interview" below.
- **The LLM path is tested only for failure.** With a key, answers go through Gemini with citation and number checks; that path is unit-tested with a mocked provider. The real model's phrasing and latency are not measured.
- **The Q4 recogniser is simulated.** Transcripts come from each call's timeline as the audio reaches them. Signals, controls and delivery are real, but recognition errors are authored (the noisy call) rather than observed.
- **Small, author-written eval sets.** The Q4 set is 16 labelled nudges over 5 calls; the Q3 language set is 26 utterances; retrieval is 72 + 17 questions. The 100% Q4 precision is after fixing two problems found on earlier runs, so real precision will be lower. The hold-out retrieval set dropped from 76.9% to 69.2% Hit@1 after unrelated corpus edits, because IDF is computed across all markets.
- **The refusal gate is conservative.** On the hold-out, it refused about half the answerable questions while answering nothing wrongly. Paraphrase-heavy questions get "let me connect you" more than they should.
- **Localization has not been reviewed by native speakers** (GAP-005). Indonesian number words for dates of birth are not parsed. Javanese and Sundanese coverage is about 20 words.
- **Single process.** Live calls are held in memory. A restart drops live calls; finished calls and leads are on disk.

## Production improvements

These are summarised from [docs/scaling-and-cost.md](docs/scaling-and-cost.md).

- **10x:** live call state in Redis, Postgres for calls and leads, sticky WebSockets with Redis pub/sub.
- **100x:** a telephony or media server feeding a streaming recogniser, a queue between transcription and nudge workers, pgvector plus full-text search with dense retrieval added to the fusion, and an FAQ answer cache.
- **Cost:** at 1M calls a month, recognition (about $0.023 to $0.028 per 3-minute call at Deepgram list price) dwarfs the LLM (about $0.0006 per call).
- **Quality loop:** nightly retrieval eval as a deploy gate, a sampled hallucination review of LLM answers, and suppression-rate dashboards per site.

## What to run before the interview

1. **Real browser calls.** Run `npm start`, open `/call.html` in Chrome on a laptop with headphones, and do three Q1 calls following `data/scenarios/calls.json` (cooperative, objection, out-of-scope). Screen-record with system audio on, then run `npm run report:latency` to fill in the ASR and TTS rows from the browser timings.
2. **Native-speaker runs.** Ask a Filipino speaker and an Indonesian speaker (ideally one from outside Jakarta) to do the Q3 scenarios. Follow the protocol in `evidence/q3/asr_tts_report.md`.
3. **LLM path.** If you have a Gemini key, set it in `.env` and repeat one call. The dashboard shows `answer_mode: llm` and the chunks it cited.

## Repository map

```text
src/kb/          ingestion pipeline, hybrid search
src/agent/       dialogue engine, market packs (health, ph-life, id-finance), grounded answers, LLM, sessions, lead action
src/realtime/    WAV reader, real-time chunk replay, streaming ASR (simulated + Deepgram), signals, nudge control, WebSocket
src/server.ts    HTTP API + static pages
public/          call.html, dashboard.html, live.html
config/          rules per market (values cite KB sections), synthetic test accounts
data/raw/        synthetic source corpus + sources.json registry
data/eval/       retrieval eval, hold-out, Q3 language eval
data/scenarios/  scripted calls;  data/q4/ Q4 calls and labels
scripts/         ingest, evals, scenarios, Q4 runner, UI smoke test, demo recorder, audio renderer
evidence/        everything the requirements ask to be shown
docs/            architecture, decisions, knowledge base, scaling and cost, interview prep
```
