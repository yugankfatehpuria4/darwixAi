# Scaling, production path and cost

## What runs today

The system is one Node process. Live calls are held in an in-memory `Map`, the KB index lives in memory, transcripts and leads are JSON files in `runtime/`, and replays run in the same process. That is right for a demo and a few concurrent calls. Every step below is a change of storage or transport; the domain code (`dialogue.ts`, packs, `signals.ts`, `nudges.ts`, `search.ts`) stays.

## 10x (tens of concurrent calls)

- **Live call state.** Move it from the `Map` to Redis, keyed by `call_id`, so any instance can take the next turn. Run 2 to 4 instances behind a load balancer.
- **Persistence.** Transcripts and leads go to Postgres: a `calls` table plus `turns` as JSONB, with indexes on `call_id`, `market` and `started_at`. The lead goes to the CRM via its API rather than a file.
- **WebSocket fan-out.** Sticky sessions per agent. Nudges for a call are published on a Redis channel, so the instance holding the agent's socket delivers them.
- **Knowledge base.** The KB stays in memory (125 chunks, about 80 ms to build). Each instance builds its own index on boot from `kb.json` in object storage. Re-ingestion writes a new version and instances reload.

## 100x (hundreds of concurrent calls)

- **Audio path.** Move to a telephony or media server (LiveKit, or Twilio Media Streams) sending audio to a streaming recogniser. Recognition becomes the cost and latency centre.
- **Queueing.** Separate the audio and recognition workers from the nudge workers, with a queue between them (Redis Streams; Kafka if several consumers need replay). The agent-assist path and the analytics path read the same transcript stream.
- **Retrieval.** Once the corpus grows past about 10k chunks, or dense retrieval is added, move the index to Postgres with pgvector plus full-text search, keeping RRF fusion in SQL or in app code. Near-duplicate detection moves from O(n²) Jaccard to MinHash/LSH.
- **LLM.** Put a per-tenant token bucket in front of the provider. Cache answers for the frequent FAQ hits (cache keyed by `chunk_ids` and register), since about 30 FAQ chunks cover most questions. Keep extractive mode as the overload fallback; it is already the failure path.

## 1M calls a month

1M calls a month is about 23 calls a minute on average, and perhaps 5 to 10 times that at peak. That is several hundred concurrent calls at a 3-minute average.

- **Recognition and voice cost** dominate (see the cost section below). Batch-price discounts do not apply to live calls.
- **Observability.** The JSON logs already carry `call_id`, chunk IDs, confidence, fallback reason and latency per turn. Ship them to a log store. Dashboards needed:
  - p50/p95 per hop
  - refusal rate
  - LLM fallback rate
  - nudges per call
  - suppression reasons
- **Alerting.** Alert on the refusal rate jumping (a KB regression) and on LLM fallback above 5% (a provider problem).
- **Hallucination monitoring.** Sample 1% of LLM answers daily and check them against their cited chunks: an automatic number and citation check (already in code) plus a human review queue.
- **Retrieval quality.** Re-run the eval set nightly and on every KB change. Fail the deploy if Hit@3 drops more than 3 points.
- **Rate limits.** Apply them per tenant and per agent on the API, and keep the 3-per-minute nudge cap per agent.

## Noisy audio at scale

The recogniser's per-segment confidence is already multiplied into every nudge's confidence, and turns below 0.45 are not acted on by the voice bot. At scale, add:

- Noise-suppression front-end (RNNoise or a provider's built-in option) before recognition.
- A per-call quality score (mean segment confidence). Calls below it get a "low audio quality: nudges paused" banner, rather than nudges that are silently missing.
- Track the suppression rate by reason per call centre. A site where `low_confidence` suppressions jump has a headset or network problem, not a sales problem.

## Cost per call (estimate, labelled)

Prices were looked up on 2026-10-02 from the providers' pricing pages. Token counts are approximate: about 520 input tokens per grounded answer, measured as characters / 4 over the 10 answered KB turns in the scripted calls, because the real API could not be called from the build sandbox. Assumptions: a 3-minute call, 2 KB questions per call, and a voice bot plus agent-assist on the same call.

| Item | Unit price | Per call | Source |
|---|---|---|---|
| LLM grounded answers (Gemini 3.5 Flash-Lite) | $0.30 / 1M input, $2.50 / 1M output | 2 x (520 in + 60 out) ≈ $0.0006 | [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) |
| Streaming recognition (Deepgram Nova-3 streaming, regular price) | $0.0077 / min monolingual, $0.0092 / min multilingual | 3 min ≈ $0.023 to $0.028 | [Deepgram pricing](https://deepgram.com/pricing) |
| TTS, telephony minutes, hosting | not priced here | not priced here | Depends on the provider chosen |
| Embeddings, vector DB | none today (lexical index in memory) | $0 | |

At 1M calls a month, recognition alone is about $23k to $28k at these prices. The LLM is about $600, and that cost is driven by how often callers ask KB questions, not by call length. Recognition is the cost to negotiate. The LLM is the latency to watch.
