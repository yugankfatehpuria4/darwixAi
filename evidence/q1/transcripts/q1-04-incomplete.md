# q1-04-incomplete: Customer cannot give the age or medical history: fields skipped, lead marked incomplete with callback

Market `in_health` | call `call_20261002_d3805525` | clock 2026-10-02T09:15:00Z | text injected at the ASR output (no audio recognition in this run)

Covers: incomplete details; required-field rule in code

| # | Speaker | Text | Notes |
|---|---|---|---|
| 0 | bot | Hello, this is Asha, a virtual assistant from Suraksha Health Insurance, calling about the health insurance enquiry you submitted. This call is recorded for quality and training purposes. Is this a good time to talk for about five minutes? | intent: greeting; register en |
| 1 | customer | Yeah okay | intent: consent_yes |
| 2 | bot | First, who would you like to cover: just yourself, or also your spouse, children or parents? | register en |
| 3 | customer | My mother in law | intent: slot:members_to_cover |
| 4 | bot | What is the age of the eldest person to be covered? | register en |
| 5 | customer | I don't know her exact age, not sure | intent: skipped:eldest_member_age |
| 6 | bot | That's fine, we can leave that for the advisor. Which city do you live in? | register en |
| 7 | customer | Chennai | intent: slot:city |
| 8 | bot | Does anyone to be covered have an existing medical condition, such as diabetes, blood pressure, thyroid or asthma? | register en |
| 9 | customer | I don't know, I'd have to ask her | intent: skipped:pre_existing_disease |
| 10 | bot | That's fine, we can leave that for the advisor. Do you have any existing health insurance, including cover from your employer? | register en |
| 11 | customer | No | intent: slot:existing_cover |
| 12 | bot | Last one: which cover amount are you looking at, 5, 10, 15 or 25 lakh rupees? You can also say not sure. | register en |
| 13 | customer | 5 lakh | intent: slot:sum_insured |
| 14 | bot | No problem. I don't have all the details yet, so an advisor will call you back within 2 working days to complete them. Thank you, goodbye. | register en |

## Outcome

```json
{
  "status": "incomplete",
  "next_action": "advisor_callback_to_complete",
  "reasons": [
    "missing required fields: eldest_member_age, pre_existing_disease"
  ],
  "rule_sources": [
    "health/policies/qualification-rules.md#Rule Q5: Required fields for a qualified lead"
  ]
}
```

## Check

PASS: every expectation in data/scenarios/calls.json met.
