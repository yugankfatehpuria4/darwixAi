# q1-05-out-of-scope: Two out-of-scope questions: bot says it does not have the information, then transfers per Rule Q6

Market `in_health` | call `call_20261002_7f85f6fb` | clock 2026-10-02T10:00:00Z | text injected at the ASR output (no audio recognition in this run)

Covers: out-of-scope question; safe fallback (no invented answer); escalation after two unanswerable questions

| # | Speaker | Text | Notes |
|---|---|---|---|
| 0 | bot | Hello, this is Asha, a virtual assistant from Suraksha Health Insurance, calling about the health insurance enquiry you submitted. This call is recorded for quality and training purposes. Is this a good time to talk for about five minutes? | intent: greeting; register en |
| 1 | customer | Yes | intent: consent_yes |
| 2 | bot | First, who would you like to cover: just yourself, or also your spouse, children or parents? | register en |
| 3 | customer | Just myself | intent: slot:members_to_cover |
| 4 | bot | What is the age of the eldest person to be covered? | register en |
| 5 | customer | Do you sell travel insurance for my Europe trip? | intent: question,unanswered |
| 6 | bot | I'm sorry, I don't have that information. I can connect you to an advisor who does. What is the age of the eldest person to be covered? | register en; KB refused (top_cosine_0.048_below_0.2); candidates `kb_in_health_coverage_f8ba08`, `kb_in_health_form_42e643` |
| 7 | customer | 33 | intent: slot:eldest_member_age |
| 8 | bot | Which city do you live in? | register en |
| 9 | customer | What is the name of your CEO? | intent: question,unanswered |
| 10 | bot | Of course. I'm transferring you to a senior advisor now. Please stay on the line. | register en; KB refused (top_cosine_0.092_below_0.2); candidates `kb_in_health_form_42e643`, `kb_in_health_cross_sell_5c70c0` |

## Outcome

```json
{
  "status": "escalated_to_human",
  "next_action": "warm_transfer_senior_advisor",
  "reasons": [
    "2 questions the knowledge base could not answer"
  ],
  "rule_sources": [
    "health/policies/qualification-rules.md#Rule Q6: Human escalation",
    "health/policies/sales-desk-notes.md#Escalation desk"
  ]
}
```

## Check

PASS: every expectation in data/scenarios/calls.json met.
