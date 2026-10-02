# q1-01-cooperative: Cooperative customer, single member, asks a policy question mid-call, gets an indicative quote

Market `in_health` | call `call_20261002_d4c7bbdc` | clock 2026-10-02T06:30:00Z | text injected at the ASR output (no audio recognition in this run)

Covers: cooperative customer; grounded KB answer; deterministic quote from premium chart; waiting-period disclosure before price

| # | Speaker | Text | Notes |
|---|---|---|---|
| 0 | bot | Hello, this is Asha, a virtual assistant from Suraksha Health Insurance, calling about the health insurance enquiry you submitted. This call is recorded for quality and training purposes. Is this a good time to talk for about five minutes? | intent: greeting; register en |
| 1 | customer | Yes, sure, go ahead | intent: consent_yes |
| 2 | bot | First, who would you like to cover: just yourself, or also your spouse, children or parents? | register en |
| 3 | customer | Just me | intent: slot:members_to_cover |
| 4 | bot | What is the age of the eldest person to be covered? | register en |
| 5 | customer | I am 29 | intent: slot:eldest_member_age |
| 6 | bot | Which city do you live in? | register en |
| 7 | customer | Before that, how does cashless treatment work at the hospital? | intent: question |
| 8 | bot | Hospital bills covered, cashless at 6,500+ network hospitals. Which city do you live in? | register en; KB extractive, chunks `kb_in_health_product_9065da`, confidence 0.444 |
| 9 | customer | Bengaluru | intent: slot:city |
| 10 | bot | Does anyone to be covered have an existing medical condition, such as diabetes, blood pressure, thyroid or asthma? | register en |
| 11 | customer | No, nothing like that | intent: slot:pre_existing_disease |
| 12 | bot | Do you have any existing health insurance, including cover from your employer? | register en |
| 13 | customer | No, I don't have any insurance | intent: slot:existing_cover |
| 14 | bot | Last one: which cover amount are you looking at, 5, 10, 15 or 25 lakh rupees? You can also say not sure. | register en |
| 15 | customer | 10 lakh | intent: slot:sum_insured |
| 16 | bot | Thank you, that's everything I need. You're eligible to apply for Family Shield. Please note: illnesses are covered after a 30-day waiting period, and pre-existing diseases after 3 years. The indicative annual premium for one member aged 26-35 with 10 lakh cover is Rs 9,600. I'll send you a written quote by email or WhatsApp within 15 minutes, and an advisor will confirm the final premium. Thank you for your time, goodbye. | register en |

## Outcome

```json
{
  "status": "qualified",
  "next_action": "send_written_quote",
  "reasons": [
    "all required fields captured",
    "eldest member aged 29 within 18-65",
    "no pre-existing condition declared"
  ],
  "rule_sources": [
    "health/policies/qualification-rules.md#Rule Q1: Entry age",
    "health/policies/qualification-rules.md#Rule Q5: Required fields for a qualified lead",
    "health/tables/family-shield-premium-chart.csv"
  ],
  "details": {
    "city_verification": "manual_verification_required",
    "indicative_premium": {
      "age_band": "26-35",
      "sum_insured_lakh": 10,
      "annual_premium_inr": 9600,
      "basis": "individual, per member, annual, indicative"
    }
  }
}
```

## Citations used

- Family Shield Health Plan [kb_in_health_product_9065da] (https://suraksha-example.in/plans/family-shield, v1.0, effective 2026-04-01)

## Check

PASS: every expectation in data/scenarios/calls.json met.
