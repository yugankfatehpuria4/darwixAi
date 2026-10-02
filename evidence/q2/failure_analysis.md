# Q2 retrieval: failure analysis

Numbers here come from `npm run eval:retrieval` (output in `retrieval_results.md`, raw per-query results in `retrieval_runs.json`). Corpus is synthetic; see `GAPS.md` GAP-001/GAP-002.

## How the numbers moved, and why

We kept the first run's numbers so the fixes are visible, not hidden.

| Run | Change | Health Hit@1 | Health Hit@3 | Pooled Hit@1 | Pooled Hit@3 | Pooled MRR@5 |
|---|---|---|---|---|---|---|
| 1 | first run | 67.6% | 88.2% | 79.3% | 93.1% | 0.851 |
| 2 | bug fix: RRF gave chunks with a zero BM25 score an arbitrary BM25 rank from sort order | 70.6% | 91.2% | 81.0% | 94.8% | 0.868 |
| 3 | outdated 2024 brochure retired in the source registry (`superseded_by`); brand names removed from the confidence score | 70.6% | 88.2% | 81.0% | 93.1% | 0.873 |
| 4 | eight synonym bridges added to `glossary.json` (wife/husband, mother/father, used up/run out, month, blood pressure, money back, complain); `reject`/`rejected` expansions removed because they dragged every "rejected" question to the claims record | 79.4% | 94.1% | 86.2% | 96.6% | 0.911 |
| 5 | bug fix: queries were not getting the canonical-term rewrite that indexed text gets ("coverage amounts" never met "sum insured") | 82.4% | 97.1% | 87.9% | 98.3% | 0.928 |
| 6 | corpus: suggested wording ("Say:" lines) added to script objection sections; section paths no longer repeat the document title | 85.3% | 97.1% | 89.7% | 98.3% | 0.934 |

Run 4 is tuning on the eval set. That is why `retrieval-holdout.json` exists: 17 questions written after run 5 and never tuned on. Hold-out Hit@1 was 76.9% (Hit@3 92.3%) when first run after run 5. It is 69.2% (Hit@3 92.3%) in the current report, against the main set's 89.7%/98.3%. That gap is the expected tuning gap, and the hold-out is the more honest number to quote. The drop from 76.9% to 69.2% is one question (x12) moving from rank 1 to rank 2. It happened after unrelated corpus edits (script wording in other markets), because BM25 and character IDF are computed over the whole corpus rather than per market. This is a small instability worth fixing: build one index per market. None of the later edits were made in response to the hold-out.

Tried and rejected: a second way to pass the refusal gate when BM25 and the character model independently agree on the top chunk. At threshold 0.2 it added one correct answer and let one more out-of-scope question through (OOS refused 92.9% -> 85.7%). Not worth it; removed.

## Remaining failures, by root cause

**1. The refusal gate is too conservative on paraphrases (most common failure).** h02, h23, p11, x01 and x02 retrieve the right chunk at rank 1 but score 0.10-0.19 cosine, under the 0.20 threshold, so the bot would say "I don't have that information" to an answerable question. On the hold-out set this is the dominant failure: answerable recall at the gate is 53.8% with 100% answered precision. Cause: character n-gram cosine measures surface overlap; "Is dialysis covered if I am not admitted overnight?" shares few n-grams with "Day-care procedures that need less than 24 hours of hospitalisation". Lowering the threshold to 0.15 recovers some of these but lets 3 of 14 out-of-scope questions through on the main set. We chose the safe side: a wrong refusal costs a transfer to a human, a wrong answer costs a mis-sold policy. Real fix: a cross-encoder reranker or a multilingual embedding model scored for answerability, which this sandbox could not download (Hugging Face is blocked here).

**2. Internal rules outrank customer-facing facts (h09).** "I have diabetes, after how long will it be covered?" returns underwriting Rule Q3 (pre-existing conditions are not rejected, need review) above the waiting-period clause. Both mention diabetes; only the second answers "how long". The voice agent avoids this by searching `audience: customer` records for customer questions (records now carry `audience`), but the raw KB eval searches everything on purpose.

**3. Numeric range lookups are not a retrieval problem (h33).** "Premium for a 30 year old for 10 lakh" needs age 30 mapped to the 26-35 band. Text retrieval cannot do arithmetic. The voice agent answers quotes from the premium chart in code (`src/agent/rules.ts`), not via retrieval.

**4. Lexical false confidence on a related-but-absent product (i14).** "Apakah Danamaju menyediakan KPR untuk rumah?" (do you offer home loans) shares "menyediakan" with the product intro and scores 0.215, just above the gate. Removing brand names from the confidence score fixed the same failure in an earlier form; this one survives. An answerability check (LLM or NLI) over the retrieved chunk is the next layer; in LLM mode the grounded prompt is told to refuse when the context does not answer, but extractive mode has no such second check.

**5. Indonesian morphology partly handled (i02, x15, x16).** "diubah" vs "perubahan", "dibutuhkan" vs "diperlukan", "nelpon" vs "telepon/menghubungi": char n-grams catch shared roots (ubah) but not synonyms. A Sastrawi-style stemmer plus a synonym list from real call transcripts is the cheap fix; multilingual embeddings the better one.

**6. "Call me next week" lands on the script's Closing (x07).** The objection section ("I need to think about it / call me later") ranks 2. The closing section mentions callbacks too. In the agent, objections are detected by intent first and searched within `category: objection` only, which avoids this.

## What we deliberately did not do

- We did not lower the threshold or remove hard questions to improve the headline number.
- We did not add expansions for words that only appear in hold-out questions.
- Out-of-scope questions are counted in the gate metrics, not hidden from Hit@k (Hit@k is defined over answerable questions only, which is stated in the results header).
