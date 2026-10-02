# Interview preparation

These are short answers in our own words, each pointing at the file that backs it. Read the file before you quote a number.

## RAG

**Why RAG?** The facts change (waiting periods, fees, grace periods) and must be citable. A model's memory cannot be audited or updated without retraining. Retrieval gives a source for every answer and a place to refuse when there is no source.

**Why this chunking?**
- One answer unit per chunk: an FAQ pair, a policy clause, a table row group, or a heading section.
- Clauses are never split, because the condition ("unless needed after an accident") is part of the rule.
- Each chunk's search text is prefixed with `title > section`, so short chunks still carry context. See `docs/decisions.md` section 2.

**Why no embedding model?**
- None could be downloaded or called in the build environment, and we would not ship an unmeasured component.
- Lexical hybrid with character n-grams is strong on a 125-chunk corpus and robust to Indonesian/Tagalog morphology and recogniser misspellings (measured). Embeddings are the first upgrade, as a third list in the same RRF fusion.

**How do you prevent hallucination?** There are four layers:
1. A retrieval confidence gate, so a weak match gets "I don't have that information".
2. Extractive answers by default, so only source sentences are spoken.
3. When the LLM is on, it must return the IDs of the chunks it used, and code rejects unknown IDs and any number not present in the passages.
4. Business decisions are never made by the LLM.

**How do you evaluate retrieval?**
- A labelled set of 72 questions with expected source sections (several acceptable), measured with Hit@1, Hit@3 and MRR, plus out-of-scope refusal.
- A hold-out set written after tuning, an ablation, a threshold sweep, and a misspelling robustness test.
- Every miss has a root cause in `evidence/q2/failure_analysis.md`.

**Stale documents?**
- The source registry marks a retired file `superseded_by` its replacement.
- A consistency check compares key facts across sources and retires the weaker one; it caught a 2024 brochure contradicting the policy.
- Superseded records are kept for audit and never retrieved. Answers cite version and effective date.

**How do citations work?** Every hit carries `title > section [record_id] (source_url, version, effective date)`. Turn logs, transcripts, lead records and the UI all show the chunk IDs used.

## Voice

**Why this voice provider?** The browser Web Speech API gave a working web calling interface in three locales with no keys and no cost. The server is text in, text out, so a telephony provider (Twilio, LiveKit) with server-side streaming ASR plugs in front of the same `handleTurn` without touching the logic.

**How does streaming work here?**
- In the call page, the browser recogniser streams interim results and the final result triggers the turn.
- In Q4, audio is cut into 250 ms chunks released on the wall clock. The recogniser emits partials and finals; finals drive the signal detectors.

**Barge-in?** It is off by default because laptop speakers echo into the mic. With headphones, the page keeps listening while the bot speaks. `onspeechstart` cancels the bot's speech, and the next turn is flagged `barged_in`.

**ASR errors?**
- The recogniser's confidence is passed with each turn. Below 0.45 the bot asks again instead of acting; three in a row trigger a transfer.
- Conflicting values ("58" then "68") are confirmed, not overwritten.
- Identity values must match exactly, or nothing about the account is disclosed.

**Reducing latency?**
- Everything server-side is sub-10 ms (no network hops, an in-memory index built at boot).
- The LLM has a 2.5 s timeout with an extractive fallback, and is skipped entirely for slot answers. Only questions use it.
- The real budget is ASR plus TTS. In production: streaming TTS, starting speech on the first sentence, and endpointing tuned per market.

## Multilingual

**Why literal translation fails.**
- "Your premium of PHP 7350.00 is due on 10/07/2026" is wrong in register, in how money is said, and possibly in date order.
- Filipinos say "premium" and "due" in English inside Tagalog sentences.
- Indonesian callers expect Bapak/Ibu, never "kamu".
- A payday-driven late payment needs the due-date-change offer, which is a policy fact rather than a phrasing.

See `evidence/q3/localization_examples.md`.

**Code-switching.**
- Recognition uses one locale for the whole call (`fil-PH`), carrying the English words.
- Understanding uses lexicons that cover both languages.
- Retrieval uses glossary expansion plus character n-grams, so "na-late po ako sa bayad" finds both the Taglish FAQ and the English policy.
- The reply register follows the caller per utterance.

**How Taglish was tested.** Through scripted calls and a 26-utterance understanding eval at text level. Audio-level recognition of Taglish has not been tested: that needs a Filipino speaker, and the protocol is in `asr_tts_report.md`. Say so plainly.

**Indonesian regional speech.** Javanese krama and Sundanese lemes words are in the glossary and lexicons, and those callers get the formal register. Accent effects on the recogniser are untested (GAP-008).

## Real-time AI

**Low latency.**
- Rule detectors (about 1 ms) instead of an LLM per segment, and an in-memory KB lookup.
- A WebSocket push.
- p95 is 5 ms end to end excluding recognition. With a real recogniser, its endpointing (300 to 700 ms) dominates.

**Why WebSockets?** The server pushes nudges as they happen and the client acknowledges each one when painted, which closes the latency measurement. Server-sent events would also work for one-way push; WebSocket lets the same channel carry live segments up from the browser.

**P50/P95.** Nearest-rank over delivered nudges. Each nudge carries `t_audio_received`, `t_transcribed`, `t_signal`, `kb_ms`, `t_ready`, `t_sent`, and the client's receipt time.

**Duplicate suppression.**
- One active nudge per topic.
- A 90 s topic cooldown after it expires or resolves.
- Agent speech that addresses it resolves it ("this call is recorded" clears the disclosure nudge).
- At most 3 advisory nudges a minute; compliance and risk are exempt and uncounted.

**Noisy audio.** Each signal's confidence is multiplied by the recogniser's confidence for that segment. On the noisy call, "my parent" (ASR 0.41) and "expensive" (0.37) became 0.2 and were suppressed: no nudges. Negations ("my parents already have their own policy") raise no signal at all.

## Production

**10x?** Redis for live call state, Postgres for calls and leads, sticky WebSockets with pub/sub. See `docs/scaling-and-cost.md`.

**LLM fails?** Extractive answer from the same chunk. Tested by making it unreachable: the call still passes.

**Vector DB fails?** Today the index is in memory, built at boot. With an external store, a failed search returns "not answerable" and the bot falls back and offers a human, which is the same safe path as a weak match.

**PII?**
- Masked or removed at ingestion per a policy table; customer records are excluded and only a keyed hash is kept.
- Transcripts are masked before disk (whole-word account names).
- Logs carry IDs only.
- Nothing real is in git.

**Monitoring hallucinations.**
- The automatic citation and number check on every LLM answer, with rejections logged.
- Daily sampling of answers for human review against cited chunks.
- Refusal and fallback rates on a dashboard.

**Cost.** Recognition dominates: about $0.023 per 3-minute call at Deepgram list price, against about $0.0006 for the LLM. Control recognition with endpointing and by not transcribing hold music. Control LLM cost with extractive-first answers and an FAQ cache.

## Explain the architecture from scratch (practice)

Give this out loud in two minutes, without notes:

1. Sources go into a registry, then ingestion: extract, clean, PII, dedupe, chunk, conflict check. The result is records with citations.
2. Retrieval is hybrid lexical with a refusal gate.
3. The voice turn: browser ASR, then the engine (deterministic flow, market pack), then rules in code for decisions and the KB for questions and objections (optional LLM with guards), then the reply and browser TTS. A lead record and webhook come out at the end.
4. Q4: chunked audio, then the recogniser, then detectors with call context, then nudge control, then a WebSocket to the agent. Timestamps are kept end to end.
5. What is real versus simulated, and what is measured versus not.

Then expect: "What would you build next?"

1. Real speech tests with native speakers.
2. Dense retrieval plus an answerability check to fix the conservative gate.
3. A telephony integration.
