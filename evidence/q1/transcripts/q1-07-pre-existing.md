# q1-07-pre-existing: Declared diabetes: bot neither approves nor rejects, routes to underwriting review

Market `in_health` | call `call_20261002_432fe5b4` | clock 2026-10-02T12:00:00Z | text injected at the ASR output (no audio recognition in this run)

Covers: pre-existing condition rule; no medical decision by the bot

| # | Speaker | Text | Notes |
|---|---|---|---|
| 0 | bot | Hello, this is Asha, a virtual assistant from Suraksha Health Insurance, calling about the health insurance enquiry you submitted. This call is recorded for quality and training purposes. Is this a good time to talk for about five minutes? | intent: greeting; register en |
| 1 | customer | Sure | intent: consent_yes |
| 2 | bot | First, who would you like to cover: just yourself, or also your spouse, children or parents? | register en |
| 3 | customer | Myself and my wife | intent: slot:members_to_cover |
| 4 | bot | What is the age of the eldest person to be covered? | register en |
| 5 | customer | I'm 52 | intent: slot:eldest_member_age |
| 6 | bot | Which city do you live in? | register en |
| 7 | customer | Noida | intent: slot:city |
| 8 | bot | Does anyone to be covered have an existing medical condition, such as diabetes, blood pressure, thyroid or asthma? | register en |
| 9 | customer | Yes, my wife has diabetes | intent: slot:pre_existing_disease |
| 10 | bot | Do you have any existing health insurance, including cover from your employer? | register en |
| 11 | customer | Is there a waiting period for that? | intent: question |
| 12 | bot | Hospitalisation due to any illness is covered after an initial waiting period of 30 days from the policy start date. Pre-existing diseases are covered after a waiting period of 3 years of continuous coverage. Do you have any existing health insurance, including cover from your employer? | register en; KB extractive, chunks `kb_in_health_waiting_period_65a836`, confidence 0.363 |
| 13 | customer | No, we don't have any insurance | intent: slot:existing_cover |
| 14 | bot | Last one: which cover amount are you looking at, 5, 10, 15 or 25 lakh rupees? You can also say not sure. | register en |
| 15 | customer | 25 lakh | intent: slot:sum_insured |
| 16 | bot | Thank you for telling me. Because a medical condition was declared, an underwriter needs to review this before we can quote. This is not a rejection. I've scheduled an underwriter to call you back within 2 working days. Thank you, goodbye. | register en |

## Outcome

```json
{
  "status": "needs_underwriting_review",
  "next_action": "underwriter_callback",
  "reasons": [
    "pre-existing condition declared; the bot does not accept or reject on medical grounds"
  ],
  "rule_sources": [
    "health/policies/qualification-rules.md#Rule Q1: Entry age",
    "health/policies/qualification-rules.md#Rule Q5: Required fields for a qualified lead",
    "health/policies/qualification-rules.md#Rule Q3: Pre-existing conditions"
  ]
}
```

## Citations used

- Family Shield Health Plan > Waiting periods [kb_in_health_waiting_period_65a836] (https://suraksha-example.in/plans/family-shield, v1.0, effective 2026-04-01)

## Check

PASS: every expectation in data/scenarios/calls.json met.
