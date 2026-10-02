# Evidence index

Every file here was produced by a script in this repo (the command is in each file's header) or written by hand where marked. "Synthetic" means generated test material, not real customers or real speech.

## Q2: Knowledge base

| File | Shows | How produced |
|---|---|---|
| `q2/retrieval_results.md` | Hit@1/Hit@3/MRR per market and per caller language, ablation, refusal-threshold sweep, robustness to ASR-style misspellings, hold-out set, per-question verdicts | `npm run eval:retrieval` |
| `q2/retrieval_runs.json` | Raw results per question: expanded query, top 5 with scores and citations | same |
| `q2/eval_set.json` | The 72-question eval set used | same (copy of `data/eval/retrieval-eval.json`) |
| `q2/five_queries.md` | The five required query types with record, source, relevance and verdict | hand-written from `npm run search` output |
| `q2/failure_analysis.md` | How the numbers moved run by run (including tuning on the eval set), every remaining miss by root cause | hand-written |
| `data/processed/ingest-report.json` (generated, not committed) | Extraction failures, excluded customer records, dropped duplicates and boilerplate, PII redactions, conflicts | `npm run ingest` |

## Q1: Voice agent

| File | Shows | How produced |
|---|---|---|
| `q1/scenario_results.md` | 18 scripted calls (9 Q1): expected and actual outcome, KB turns, pass/fail | `npm run scenarios` |
| `q1/transcripts/*.md`, `*.json` | Turn-by-turn transcripts with intent, KB chunk IDs, confidence, answer mode, outcome and citations. Stored transcripts are PII-masked. | same |
| `audio/q1-*.ogg` | **Synthetic** renders of each scripted call (espeak-ng voices on both sides). For listening only; not real speech. | `npm run render:audio` |
| `q1/latency.md` | Per-hop latency over 86 turns. ASR, TTS and LLM are n/a: not measurable without a browser microphone and a key. | `npm run report:latency` |
| `q1/llm_unavailable_fallback.log` | LLM unreachable: answers fall back to extractive, the call still passes | `GEMINI_API_KEY=dummy npm run scenarios -- q1-07` |
| `q1/web_call_ui.png`, `q1/dashboard_ui.png` | The web calling page and dashboard driven in headless Chromium with typed turns | `npm run ui:smoke` |

The three required recorded calls are the synthetic renders above (`q1-01`, `q1-02`, `q1-05`, plus six more). Real recorded calls through the browser are still to be made; see the README section "What to run before the interview".

## Q3: Native-language bots

| File | Shows | How produced |
|---|---|---|
| `q3/transcripts/q3-ph-*`, `q3-id-*` | 5 Philippine and 4 Indonesian calls covering cooperative, sector objection, mixed English finance terms, colloquial speech, human escalation, Javanese and Sundanese vocabulary, wrong person | `npm run scenarios` |
| `audio/q3-*.ogg` | **Synthetic** renders. espeak-ng has no Tagalog voice, so the Indonesian voice reads the Tagalog. | `npm run render:audio` |
| `q3/localization_examples.md` | 5 examples per market: literal translation vs what the bot says, and why | hand-written |
| `q3/language_eval.md` | Register, intent and slot extraction on 26 code-switched, colloquial and regional utterances | `npm run eval:language` |
| `q3/asr_tts_report.md` | Speech configuration per market, what was and was not tested, and the protocol for the live native-speaker test | hand-written |
| `q3/web_call_id_ui.png` | The Indonesian bot in the web page | `npm run ui:smoke` |

The first run of `language_eval` scored 24/26. Two failures were fixed:

- An indirect question ("I'd like to know what happens if...") was not recognised as a question.
- "ngapain" was not in the colloquial lexicon, so a casual caller was answered formally.

The current file shows 26/26 after these fixes. Those two utterances are now tuned, not held out.

## Q4: Live insights and nudges

| File | Shows | How produced |
|---|---|---|
| `q4/live_demo.webm` | Screen recording (2 min, video only) of `live.html` while two calls replay at real-time speed: nudges appear mid-call, grey out when the agent acts, and suppressed signals are listed | `npm run record:demo` |
| `q4/live_q4-*.png` | End-of-call screenshots of the same | same |
| `q4/latency.md` | Component and end-to-end latency for every delivered nudge (1x speed, 5 concurrent calls) | `npm run q4` |
| `q4/nudge_precision.md` | TP/FP/missed per call against labels written before the run, every suppression with its reason, and the threshold sweep | same |
| `q4/runs/*.jsonl` | Every message the agent's screen received, with timestamps | same |
| `q4/llm_unavailable_fallback.log` | Nudge rephrasing on with an unreachable LLM: template text delivered, `llm_error` recorded | see header |
| `audio/q4-*.wav`, `*.timeline.json` | The Q4 test calls (synthetic voices; noise mixed into `q4-health-noisy`) and their aligned transcripts | `npm run render:audio -- data/q4/calls/*.json` |

### Run history for Q4

These numbers are kept so the final ones are not mistaken for a first-try result.

| Run | Speed | Result | What changed afterwards |
|---|---|---|---|
| 1 | 4x | 11 TP, 1 FP, 5 missed | Rate limiting counted mandatory compliance nudges against the 3-per-minute budget, which starved advisory nudges. Compliance and risk were made exempt and uncounted. The threat nudge required a KB citation and its lookup was filtered to the wrong audience; compliance and risk now never depend on a citation. |
| 2 | 1x | 16 TP, 1 FP, 0 missed | The FP: the bot saying "several lakh rupees ... monthly" matched the price-quote pattern. Vague quantities ("several", "few") no longer count as a quote. The noisy call produced no signals at all, so the confidence gate was not actually exercised. The singular "parent" and a weak "expensive" signal were added so that noisy fragments raise low-confidence signals for the gate to suppress. |
| 3 (reported) | 1x | 16 TP, 0 FP, 0 missed; 2 low-confidence suppressions on the noisy call | |

The labelled set is small (16 expected nudges over 5 calls) and written by us. Expect lower precision on real calls.

## Audio files

- Opus files (`*.ogg`) are committed for every scripted call.
- WAV is committed only for the five calls `live.html` and `npm run q4` replay.
- Regenerate the rest with `npm run render:audio`.
