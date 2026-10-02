# q1-09-call-later: Customer wants time to think: objection script wording, callback scheduled, call ends politely

Market `in_health` | call `call_20261003_c0ae5142` | clock 2026-10-03T14:45:00Z | text injected at the ASR output (no audio recognition in this run)

Covers: objection that ends the call; callback scheduling

| # | Speaker | Text | Notes |
|---|---|---|---|
| 0 | bot | Hello, this is Asha, a virtual assistant from Suraksha Health Insurance, calling about the health insurance enquiry you submitted. This call is recorded for quality and training purposes. Is this a good time to talk for about five minutes? | intent: greeting; register en |
| 1 | customer | Yes okay | intent: consent_yes |
| 2 | bot | First, who would you like to cover: just yourself, or also your spouse, children or parents? | register en |
| 3 | customer | Let me think about it and call me next week | intent: objection:call_later |
| 4 | bot | Of course, take your time. I can send you a written quote by email or WhatsApp, and set up a callback at a time that suits you. I've noted that. Thank you for your time, goodbye. | register en; KB extractive, chunks `kb_in_health_objection_f1d729`, confidence 0.292 |

## Outcome

```json
{
  "status": "callback_requested",
  "next_action": "send_written_quote_and_callback",
  "reasons": [
    "objection: call_later"
  ],
  "rule_sources": []
}
```

## Citations used

- Family Shield Outbound Lead Qualification Script > Objection: I need to think about it / call me later [kb_in_health_objection_f1d729] (internal://sales/lead-qualification-script-v3.1, v3.1, effective 2026-04-01)

## Check

PASS: every expectation in data/scenarios/calls.json met.
