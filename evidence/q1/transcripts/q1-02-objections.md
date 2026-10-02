# q1-02-objections: Price objection and employer-cover objection, answered from the objection script, then qualified

Market `in_health` | call `call_20261002_86febf64` | clock 2026-10-02T07:10:00Z | text injected at the ASR output (no audio recognition in this run)

Covers: objection; grounded objection handling; optional field skipped

| # | Speaker | Text | Notes |
|---|---|---|---|
| 0 | bot | Hello, this is Asha, a virtual assistant from Suraksha Health Insurance, calling about the health insurance enquiry you submitted. This call is recorded for quality and training purposes. Is this a good time to talk for about five minutes? | intent: greeting; register en |
| 1 | customer | Okay, yes | intent: consent_yes |
| 2 | bot | First, who would you like to cover: just yourself, or also your spouse, children or parents? | register en |
| 3 | customer | Me and my wife | intent: slot:members_to_cover |
| 4 | bot | What is the age of the eldest person to be covered? | register en |
| 5 | customer | 41 | intent: slot:eldest_member_age |
| 6 | bot | Which city do you live in? | register en |
| 7 | customer | Delhi | intent: slot:city |
| 8 | bot | Does anyone to be covered have an existing medical condition, such as diabetes, blood pressure, thyroid or asthma? | register en |
| 9 | customer | Honestly this is too expensive, I can't afford it | intent: objection:price |
| 10 | bot | I understand, budget matters. One hospital stay can cost several lakh rupees, and your premium stays fixed for the year. We can look at a lower cover amount, a single family floater instead of separate policies, a 10% family discount when two or more members are covered, or monthly auto-debit payments. Does anyone to be covered have an existing medical condition, such as diabetes, blood pressure, thyroid or asthma? | register en; KB extractive, chunks `kb_in_health_objection_b81169`, confidence 0.269 |
| 11 | customer | No medical conditions | intent: slot:pre_existing_disease |
| 12 | bot | Do you have any existing health insurance, including cover from your employer? | register en |
| 13 | customer | My company already gives me health insurance | intent: objection:employer_cover |
| 14 | bot | That is good to have. Employer cover usually stops when you change jobs or retire, and it is often shared or limited. A personal policy lets you finish the waiting periods while you are still employed, or you can add a Super Top-Up on top of your office cover. Do you have any existing health insurance, including cover from your employer? | register en; KB extractive, chunks `kb_in_health_objection_46ccac`, confidence 0.404 |
| 15 | customer | Yes, through work | intent: slot:existing_cover |
| 16 | bot | Last one: which cover amount are you looking at, 5, 10, 15 or 25 lakh rupees? You can also say not sure. | register en |
| 17 | customer | Not sure, you tell me | intent: skipped:sum_insured |
| 18 | bot | That's fine, we can leave that for the advisor. Thank you, that's everything I need. You're eligible to apply for Family Shield. Please note: illnesses are covered after a 30-day waiting period, and pre-existing diseases after 3 years. I'll send you a written quote by email or WhatsApp within 15 minutes, and an advisor will confirm the final premium. Thank you for your time, goodbye. | register en |

## Outcome

```json
{
  "status": "qualified",
  "next_action": "send_written_quote",
  "reasons": [
    "all required fields captured",
    "eldest member aged 41 within 18-65",
    "no pre-existing condition declared"
  ],
  "rule_sources": [
    "health/policies/qualification-rules.md#Rule Q1: Entry age",
    "health/policies/qualification-rules.md#Rule Q5: Required fields for a qualified lead",
    "health/tables/family-shield-premium-chart.csv"
  ],
  "details": {
    "city_verification": "manual_verification_required",
    "indicative_premium": null,
    "premium_note": "floater premium not in provided material; advisor sends written quote"
  }
}
```

## Citations used

- Family Shield Outbound Lead Qualification Script > Objection: the premium is too expensive [kb_in_health_objection_b81169] (internal://sales/lead-qualification-script-v3.1, v3.1, effective 2026-04-01)
- Family Shield Outbound Lead Qualification Script > Objection: I already have health cover from my employer [kb_in_health_objection_46ccac] (internal://sales/lead-qualification-script-v3.1, v3.1, effective 2026-04-01)

## Check

PASS: every expectation in data/scenarios/calls.json met.
