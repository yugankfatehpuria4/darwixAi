# q1-03-conflicting: Conflicting age (58 then 68): bot asks to confirm, keeps 68, applies the entry-age rule in code

Market `in_health` | call `call_20261002_05a1a4c4` | clock 2026-10-02T08:00:00Z | text injected at the ASR output (no audio recognition in this run)

Covers: conflicting details; deterministic eligibility rule; specialist referral

| # | Speaker | Text | Notes |
|---|---|---|---|
| 0 | bot | Hello, this is Asha, a virtual assistant from Suraksha Health Insurance, calling about the health insurance enquiry you submitted. This call is recorded for quality and training purposes. Is this a good time to talk for about five minutes? | intent: greeting; register en |
| 1 | customer | Yes please | intent: consent_yes |
| 2 | bot | First, who would you like to cover: just yourself, or also your spouse, children or parents? | register en |
| 3 | customer | Me and my father | intent: slot:members_to_cover |
| 4 | bot | What is the age of the eldest person to be covered? | register en |
| 5 | customer | My father is 58 years old | intent: slot:eldest_member_age |
| 6 | bot | Which city do you live in? | register en |
| 7 | customer | Mumbai | intent: slot:city |
| 8 | bot | Does anyone to be covered have an existing medical condition, such as diabetes, blood pressure, thyroid or asthma? | register en |
| 9 | customer | He is 68 years old | intent: slot:eldest_member_age |
| 10 | bot | Just to check: earlier you said 58 years, and now 68 years. Is 68 years correct? | register en |
| 11 | customer | Yes, 68 | intent: conflict_resolved:eldest_member_age |
| 12 | bot | Okay, I'll keep 68 years. Does anyone to be covered have an existing medical condition, such as diabetes, blood pressure, thyroid or asthma? | register en |
| 13 | customer | No conditions | intent: slot:pre_existing_disease |
| 14 | bot | Do you have any existing health insurance, including cover from your employer? | register en |
| 15 | customer | No | intent: slot:existing_cover |
| 16 | bot | Last one: which cover amount are you looking at, 5, 10, 15 or 25 lakh rupees? You can also say not sure. | register en |
| 17 | customer | 15 lakh | intent: slot:sum_insured |
| 18 | bot | Thank you. Family Shield covers adults up to 65 years at entry, so for someone aged 68 there is a separate senior citizen plan handled by a specialist advisor. I've asked a specialist to call you back. Thank you, goodbye. | register en |

## Outcome

```json
{
  "status": "not_eligible_refer_specialist",
  "next_action": "specialist_callback_senior_plan",
  "reasons": [
    "eldest member aged 68 is above the Family Shield maximum entry age of 65"
  ],
  "rule_sources": [
    "health/policies/qualification-rules.md#Rule Q1: Entry age"
  ]
}
```

## Check

PASS: every expectation in data/scenarios/calls.json met.
