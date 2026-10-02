# q3-ph-03-hardship: Job loss: hardship extension callback, no promise of approval

Market `ph_life` | call `call_20261002_f26d9fb5` | clock 2026-10-02T06:00:00Z | text injected at the ASR output (no audio recognition in this run)

Covers: sector-specific objection (hardship); rule: bot cannot approve extension

| # | Speaker | Text | Notes |
|---|---|---|---|
| 0 | bot | Magandang hapon po! Si Lia po ito, virtual assistant ng Kalinga Life, partner ng Bayanihan Bank. Para po sa quality at training purposes, naka-record po ang tawag na ito. Si Ma'am [CUSTOMER_NAME] po ba ang kausap ko? | intent: greeting; register taglish |
| 1 | customer | Opo | intent: consent_yes |
| 2 | bot | Salamat po, Ma'am. Para po sa security, pwede ko po bang makuha ang huling apat na digits ng policy number ninyo? | register taglish |
| 3 | customer | 4821 | intent: slot:policy_last4 |
| 4 | bot | Salamat po, verified na po kayo. Tumatawag po ako para ipaalala na ang quarterly premium ng Kalinga Protect ninyo na 7,350 pesos ay due sa Miyerkules, ika-7 ng Oktubre. Kung sakaling ma-late po, may 31 days po kayong grace period mula sa due date. Kailan po kaya kayo makakapagbayad? | register taglish |
| 5 | customer | Nawalan po ako ng trabaho last month, hindi ko po kaya ngayon | intent: slot:payment_date |
| 6 | bot | Naiintindihan ko po, at pasensya na po sa pinagdadaanan ninyo. Ise-schedule ko po kayo ng callback sa isang Kalinga Life advisor para sa premium payment extension, hanggang 60 days, isang beses kada policy year. Ang advisor po ang mag-a-approve, kaya hindi ko po ito maipapangako. Salamat po, ingat po kayo. | register taglish |

## Outcome

```json
{
  "status": "hardship_extension_callback",
  "next_action": "advisor_callback_premium_extension",
  "reasons": [
    "customer reported hardship (job loss, illness or calamity)"
  ],
  "rule_sources": [
    "ph/policies/payment-lapse-reinstatement.md#Hardship assistance"
  ],
  "details": {
    "due_date": "2026-10-07",
    "grace_end": "2026-11-07"
  }
}
```

## Check

PASS: every expectation in data/scenarios/calls.json met.
