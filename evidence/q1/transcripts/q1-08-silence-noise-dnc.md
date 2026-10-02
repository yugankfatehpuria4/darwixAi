# q1-08-silence-noise-dnc: Silence, then unclear audio (low ASR confidence), then a do-not-call request

Market `in_health` | call `call_20261002_a30e1030` | clock 2026-10-02T12:30:00Z | text injected at the ASR output (no audio recognition in this run)

Covers: silence handling; unclear audio / STT low confidence; do-not-call

| # | Speaker | Text | Notes |
|---|---|---|---|
| 0 | bot | Hello, this is Asha, a virtual assistant from Suraksha Health Insurance, calling about the health insurance enquiry you submitted. This call is recorded for quality and training purposes. Is this a good time to talk for about five minutes? | intent: greeting; register en |
| 1 | customer | Yes | intent: consent_yes |
| 2 | bot | First, who would you like to cover: just yourself, or also your spouse, children or parents? | register en |
| 3 | customer | (silence) | intent: silence; event: silence |
| 4 | bot | Are you still there? First, who would you like to cover: just yourself, or also your spouse, children or parents? | register en |
| 5 | customer | mmh wife ah the | intent: low_confidence; asr_confidence 0.31 |
| 6 | bot | Sorry, I didn't catch that. Could you say it again? | register en |
| 7 | customer | (asr_error) | intent: asr_error; event: asr_error |
| 8 | bot | Sorry, I didn't catch that. Could you say it again? | register en |
| 9 | customer | Please don't call me again | intent: do_not_call |
| 10 | bot | Understood. I've noted that you don't want any more calls, and we won't call this number again. Goodbye. | register en |

## Outcome

```json
{
  "status": "do_not_call",
  "next_action": "mark_number_do_not_call",
  "reasons": [
    "customer asked not to be called again"
  ],
  "rule_sources": []
}
```

## Check

PASS: every expectation in data/scenarios/calls.json met.
