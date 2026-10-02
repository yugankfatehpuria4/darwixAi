# DEFENSE

Six questions for each component, answered so they can be said out loud.

## Q2: Knowledge base and retrieval

1. **Why does it exist?** The voice bots must answer from business content they can cite, not from the model's memory. Raw web pages and PDFs carry navigation, duplicates, contradictions and PII, so they cannot be retrieved from directly.
2. **Why this technology?**
   - The pipeline is plain TypeScript: every step is a function we can point at.
   - The retriever is hybrid BM25 plus character n-gram TF-IDF fused with RRF, rather than embeddings. The corpus is small, embedding models could not be downloaded or called in the build environment, and char n-grams handle Tagalog and Indonesian morphology and recogniser misspellings. That was measured: Hit@3 under misspellings was 89.7% for hybrid against 77.6% for BM25.
3. **What happens when it fails?**
   - A file that will not extract is reported and skipped.
   - Conflicting facts are flagged, and the weaker source is retired.
   - At query time, a weak match (cosine below 0.20) becomes "I don't have that information"; two of those trigger a transfer.
4. **How is it tested?**
   - Unit tests for chunking, normalisation, PII and dedup.
   - Integration tests that run the real pipeline: idempotency, chrome stripped, PII gone, superseded records never retrieved.
   - A 72-question eval set and a 17-question hold-out set written after tuning.
5. **What number tells me it works?** Hit@1 89.7% and Hit@3 98.3% on the main set, 69.2% / 92.3% on the hold-out. Refusal of out-of-scope questions is 92.9% (main) and 100% (hold-out). The refusal gate is conservative on paraphrases (hold-out answerable recall 53.8%); that is the known weakness.
6. **The 90-second version.**
   - We registered every source with its URL, authority and date.
   - Extraction strips site chrome and PDF headers, removes boilerplate repeated across pages, masks PII, and keeps customer records out entirely.
   - We chunk by meaning: one FAQ pair, one policy clause, one table row group. Each chunk carries its title, section, version and audience.
   - Near-duplicates are collapsed, and a consistency check caught an old brochure claiming a 4-year waiting period against the policy's 36 months; the brochure is retired.
   - Retrieval is hybrid lexical with a confidence gate, measured on 89 questions, with an honest hold-out and a written failure analysis.

## Q1: Knowledge-grounded voice agent

1. **Why does it exist?** To qualify health-insurance leads on a call: collect five facts, answer questions from the KB, handle objections with approved wording, and hand off to a human when it should.
2. **Why this technology?**
   - A deterministic state machine plus rules in code, because eligibility must be auditable and must not depend on a model's mood.
   - Retrieval for questions and objections.
   - Gemini only to phrase answers from cited chunks, and optional.
   - Browser Web Speech for a web calling interface with no provider keys.
3. **What happens when it fails?**
   - Silence prompts "Are you still there?"; two silences end with a callback.
   - Low recogniser confidence prompts a re-ask; three in a row trigger a transfer.
   - Unanswerable questions get the fallback line; two trigger a transfer.
   - An LLM timeout or bad output falls back to the extractive answer from the same chunk. This was tested by making the LLM unreachable, and the call still passed.
   - A webhook failure is logged, and the transfer happens anyway.
4. **How is it tested?**
   - 9 scripted health calls covering cooperative, objections, conflicting, incomplete, out-of-scope, human request, pre-existing condition, silence/noise/do-not-call, and call-later. All pass with expectations on outcome, intents and KB use.
   - Unit tests on the engine, the LLM guardrails (invented numbers, unknown citations, timeout), parsing, and a drift test that fails the build if rule values or spoken numbers disagree with the KB.
   - A headless browser test drives the real web page.
5. **What number tells me it works?**
   - 18/18 scenarios pass (9 of them Q1).
   - Server-side turn latency p95 is 3.3 ms.
   - The KB-question turns all carry chunk IDs.
   - Not yet measured: ASR, TTS and LLM latency, which need a browser call with a microphone and a key.
6. **The 90-second version.**
   - The bot follows the script's order: consent with the recording notice, who to cover, eldest age, city, conditions, existing cover, optional cover amount.
   - Each answer is parsed in code, conflicts are confirmed rather than overwritten, and "I don't know" is accepted.
   - Questions and objections go to the KB. The bot speaks either the source sentence or an LLM rephrase that must cite the chunk and may not add a number.
   - The decision (qualified, needs underwriting, senior plan, incomplete) is made by rules whose values are tied to the KB by a test.
   - The result is a lead record with reasons, rule sources and chunk IDs, plus a webhook on escalation.

## Q3: Native-language voice bots

1. **Why does it exist?** Philippine and Indonesian callers do not speak the English script translated. They code-switch, expect particular forms of address, and hear amounts and dates differently. Each sector also has its own conversation: a premium reminder and an instalment reminder.
2. **Why this technology?** The same engine and retriever as Q1, with a market pack per country: lines per register, lexicons, rules and the KB in the local language. That is reuse without a fork. Browser recognisers for `fil-PH` and `id-ID` were chosen because they need no keys.
3. **What happens when it fails?**
   - Misheard or unclear speech gets a re-ask in the caller's own register.
   - If identity cannot be verified after two tries, the call goes to a human, and nothing about the account is disclosed to an unverified person.
   - Fallback and escalation lines exist in every register, so the bot never switches language unexpectedly.
4. **How is it tested?**
   - 9 scripted calls: 5 Philippines (Taglish, payday objection, hardship, English with a failed identity check, wrong person) and 4 Indonesia (formal, colloquial with a late fee, Javanese hardship, Sundanese escalation). All pass.
   - A 26-utterance understanding eval covering register, intent and slot. It passed 24/26 on the first run and 26/26 after two fixes, both documented.
   - Per-language retrieval metrics.
5. **What number tells me it works?**
   - Philippines Hit@1 100% (12 questions), Indonesia 91.7% (12).
   - 26/26 utterances understood after the fixes.
   - Recognition quality per accent is UNTESTED (GAP-008). That is the honest gap.
6. **The 90-second version.**
   - The Philippine bot speaks Taglish with po/opo, uses Ma'am plus surname, keeps "premium" and "due" in English as Filipinos do, says "7,350 pesos" and "Miyerkules, ika-7 ng Oktubre", and switches to English only when the caller does.
   - The Indonesian bot stays with Bapak/Ibu even when relaxed, says amounts in words, offers the due-date change when the reason is payday, computes the late fee in rupiah, and stays formal with Javanese or Sundanese polite speech.
   - Both reuse the Q1 engine and KB. The differences are data, not code paths.

## Q4: Real-time insights and nudges

1. **Why does it exist?** To help a human agent during the call: catch compliance slips, risky promises, missed opportunities, hardship, frustration and callback requests while there is still time to act.
2. **Why this technology?**
   - Chunked audio paced by the wall clock, so the pipeline sees the call as it happens.
   - Rule detectors, because they take milliseconds, are deterministic and are auditable for compliance.
   - Explicit nudge controls, because without them agents get spammed.
   - A WebSocket, because nudges are server-pushed.
   - Recognition is simulated from the timeline by default. That is the honest substitute when no streaming recogniser is reachable, and it never releases text before its audio.
3. **What happens when it fails?**
   - Low recogniser confidence lowers signal confidence, and the nudge is suppressed. This was shown on the noisy call: two signals at 0.20, none shown.
   - An LLM rephrase that times out keeps the template text.
   - A KB miss drops a sales nudge but never a compliance one.
   - A disconnect aborts the replay.
   - The call itself never depends on the nudge pipeline.
4. **How is it tested?**
   - 5 labelled calls replayed at 1x real time through the real server and WebSocket: health agent slips, a pushy collector, a Philippine life event, a noisy call, and a reused Q1 call.
   - Labels were written before the engine ran.
   - Unit tests for pacing, the never-ahead recogniser, Deepgram parsing, each detector, and each control.
   - A screen recording of the page.
5. **What number tells me it works?**
   - Final run: 16/16 expected nudges, 0 false positives, the cross-sell during hardship correctly suppressed, and 0 nudges on the noisy call.
   - The first real-time run had 1 false positive; it is reported.
   - The set is small and written by us, so real precision will be lower.
   - End-to-end p95 is 5 ms excluding recognition. Real ASR latency is not measured.
6. **The 90-second version.**
   - Audio streams in 250 ms chunks at real-time pace.
   - A recogniser produces speaker-labelled segments, and on each one we run rule detectors with call context: was the recording notice given, was identity verified, is the customer in hardship, is frustration rising.
   - Each signal's confidence is multiplied by the recogniser's. Nudges must clear 0.6, one per topic, with a 90 s cooldown and at most 3 advisory nudges a minute, though compliance always gets through.
   - Sales nudges are held back while the customer is struggling.
   - Nudges cite the KB, expire, and clear themselves when the agent says the right thing.
   - Every nudge carries timestamps from audio received to painted on screen.
