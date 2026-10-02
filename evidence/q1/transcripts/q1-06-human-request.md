# q1-06-human-request: Customer asks for a human straight away; transferred live inside desk hours

Market `in_health` | call `call_20261002_db9d6070` | clock 2026-10-02T11:00:00Z | text injected at the ASR output (no audio recognition in this run)

Covers: human-assistance request; escalation webhook

| # | Speaker | Text | Notes |
|---|---|---|---|
| 0 | bot | Hello, this is Asha, a virtual assistant from Suraksha Health Insurance, calling about the health insurance enquiry you submitted. This call is recorded for quality and training purposes. Is this a good time to talk for about five minutes? | intent: greeting; register en |
| 1 | customer | Yes | intent: consent_yes |
| 2 | bot | First, who would you like to cover: just yourself, or also your spouse, children or parents? | register en |
| 3 | customer | Can I talk to a real person please? | intent: escalation_request |
| 4 | bot | Of course. I'm transferring you to a senior advisor now. Please stay on the line. | register en |

## Outcome

```json
{
  "status": "escalated_to_human",
  "next_action": "warm_transfer_senior_advisor",
  "reasons": [
    "customer asked for a human"
  ],
  "rule_sources": [
    "health/policies/qualification-rules.md#Rule Q6: Human escalation",
    "health/policies/sales-desk-notes.md#Escalation desk"
  ]
}
```

## Check

PASS: every expectation in data/scenarios/calls.json met.
