# q3-ph-04-english-escalation: English-speaking policyholder, wrong last four once, then asks about a claim and is passed to an advisor in English

Market `ph_life` | call `call_20261002_30f32cd9` | clock 2026-10-02T09:00:00Z | text injected at the ASR output (no audio recognition in this run)

Covers: English support; identity check retry; human escalation in the customer's language

| # | Speaker | Text | Notes |
|---|---|---|---|
| 0 | bot | Magandang hapon po! Si Lia po ito, virtual assistant ng Kalinga Life, partner ng Bayanihan Bank. Para po sa quality at training purposes, naka-record po ang tawag na ito. Si Ma'am [CUSTOMER_NAME] po ba ang kausap ko? | intent: greeting; register taglish |
| 1 | customer | Yes, this is [CUSTOMER_NAME] [CUSTOMER_NAME] speaking | intent: consent_yes |
| 2 | bot | Thank you, Ma'am. For security, may I have the last four digits of your policy number? | register en |
| 3 | customer | It's 4812 | intent: verify_failed:policy_last4 |
| 4 | bot | Sorry, that doesn't match our record. Could you say the last four digits again? | register en |
| 5 | customer | Sorry, 4821 | intent: slot:policy_last4 |
| 6 | bot | Thank you, you're verified. I'm calling to remind you that your quarterly premium for Kalinga Protect, 7,350 pesos, is due on Wednesday, October 7. If you need a little more time, there's a 31-day grace period from the due date. When do you think you'll be able to pay? | register en |
| 7 | customer | Actually I have a question about a claim for my husband, can I talk to an advisor? | intent: escalation_request |
| 8 | bot | Of course, I'm passing you to a Kalinga Life advisor. One moment please. | register en |

## Outcome

```json
{
  "status": "escalated_to_human",
  "next_action": "advisor_transfer_or_callback",
  "reasons": [
    "customer asked for a human"
  ],
  "rule_sources": [
    "ph/scripts/premium-reminder-script.md#Escalation"
  ]
}
```

## Check

PASS: every expectation in data/scenarios/calls.json met.
