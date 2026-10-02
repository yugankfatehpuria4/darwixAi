# Q2 retrieval demonstration: the five required query types

Output of `npm run search -- "<query>" --market in_health` (same code path the voice agent uses). Verdicts and relevance notes are ours; confidence is the char n-gram cosine of the top chunk with brand names removed (refusal below 0.20).

| # | Type | User question | Retrieved record | Source reference | Relevance | Verdict |
|---|---|---|---|---|---|---|
| 1 | Product | What is a super top-up and when does it pay? | `kb_in_health_cross_sell_b83b7e` | Super Top-Up and Add-ons > Super Top-Up Plan (suraksha-example.in/plans/super-top-up, v1.0, eff. 2026-04-01) | States what the plan is and the trigger (bills cross a fixed deductible, e.g. Rs 5 lakh). Answers both halves of the question. Confidence 0.394. | correct |
| 2 | Policy | Is cosmetic surgery covered? | `kb_in_health_exclusions_d3c891` | Family Shield Policy Wordings > Permanent Exclusions, clause 4.1 (PDF, eff. 2026-04-01) | Clause 4.1 excludes cosmetic surgery unless needed after an accident or burn. Comes from the policy wordings, the most authoritative source, and keeps the exception that a website summary might drop. Confidence 0.253. | correct |
| 3 | Qualification | What is the maximum age to join the plan? | `kb_in_health_eligibility_a2c567` | Family Shield Health Plan > Who can buy Family Shield (website) | Contains "maximum entry age is 65 years". The same rule in underwriting Rule Q1 is agent-facing; for a caller the public statement is the right one to cite. The bot's actual eligibility decision is made in code, not from this text. Confidence 0.234. | correct |
| 4 | FAQ | Do I have to go for a medical test before buying? | `kb_in_health_faq_e03663` | Frequently Asked Questions > Do I need a medical check-up before buying the policy? | Exact FAQ match despite different wording ("medical test" vs "medical check-up"). Gives the 45-year / pre-existing-condition rule. Confidence 0.575. | correct |
| 5 | Objection | This is too expensive, I can't afford it | `kb_in_health_objection_b81169` | Lead Qualification Script v3.1 > Objection: the premium is too expensive (internal) | The approved objection response: acknowledge, cost of a hospital stay, lower cover, floater, 10% family discount, monthly auto-debit, and the instruction not to invent discounts. Confidence 0.250. | correct |

Two further cases worth showing in the demo:

| Type | User question | Result | Verdict |
|---|---|---|---|
| Out of scope | Do you sell travel insurance for my Europe trip? | Top chunk is the script's Opening at confidence 0.079, below 0.20, so `answerable: false` and the bot says it does not have that information. | correct (refused) |
| Known failure | Apakah Danamaju menyediakan KPR untuk rumah? (Do you offer home loans?) | Product intro at confidence 0.215, just above the gate, so it would be answered. The chunk is about motorcycle financing and does not mention home loans. See `failure_analysis.md` item 4. | incorrect |
