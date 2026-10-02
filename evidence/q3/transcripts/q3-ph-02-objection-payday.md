# q3-ph-02-objection-payday: "Sa sweldo pa po" objection with a date on the 15th, mixed English finance terms

Market `ph_life` | call `call_20261002_15630140` | clock 2026-10-02T05:30:00Z | text injected at the ASR output (no audio recognition in this run)

Covers: sector-specific objection; mixed English/finance terms; colloquial speech

| # | Speaker | Text | Notes |
|---|---|---|---|
| 0 | bot | Magandang hapon po! Si Lia po ito, virtual assistant ng Kalinga Life, partner ng Bayanihan Bank. Para po sa quality at training purposes, naka-record po ang tawag na ito. Si Ma'am [CUSTOMER_NAME] po ba ang kausap ko? | intent: greeting; register taglish |
| 1 | customer | Oo, ako nga | intent: consent_yes |
| 2 | bot | Salamat po, Ma'am. Para po sa security, pwede ko po bang makuha ang huling apat na digits ng policy number ninyo? | register taglish |
| 3 | customer | Yung last four ko po ay 4821 | intent: slot:policy_last4 |
| 4 | bot | Salamat po, verified na po kayo. Tumatawag po ako para ipaalala na ang quarterly premium ng Kalinga Protect ninyo na 7,350 pesos ay due sa Miyerkules, ika-7 ng Oktubre. Kung sakaling ma-late po, may 31 days po kayong grace period mula sa due date. Kailan po kaya kayo makakapagbayad? | register taglish |
| 5 | customer | Wala pa po akong pambayad, sa sweldo pa po sa 15 | intent: objection:no_money_yet,slot:payment_date |
| 6 | bot | Naiintindihan ko po, Ma'am. May 31 days po kayong grace period mula sa due date, kaya active pa rin po ang coverage ninyo habang hindi pa lumalampas doon. Kung nawalan po kayo ng trabaho o nagkasakit, pwede ko po kayong i-schedule ng callback sa advisor para sa premium payment extension. Saan po kayo magbabayad: sa Bayanihan Bank branch, sa mobile app, o sa e-wallet? | register taglish; KB extractive, chunks `kb_ph_life_objection_fd5e66`, confidence 0.398 |
| 7 | customer | Over the counter na lang sa branch | intent: slot:payment_channel |
| 8 | bot | Salamat po! Itatala ko po na magbabayad kayo sa Huwebes, ika-15 ng Oktubre sa Bayanihan Bank branch. Pasok pa po iyon sa grace period, kaya tuloy po ang coverage ninyo. Ipapadala po ang official receipt sa email at SMS. Salamat po, ingat po kayo! | register taglish |

## Outcome

```json
{
  "status": "promise_within_grace",
  "next_action": "log_promise_to_pay",
  "reasons": [
    "promise 2026-10-15 within grace period ending 2026-11-07"
  ],
  "rule_sources": [
    "ph/policies/payment-lapse-reinstatement.md#Grace period"
  ],
  "details": {
    "due_date": "2026-10-07",
    "grace_end": "2026-11-07",
    "promise_date": "2026-10-15",
    "channel": "branch"
  }
}
```

## Citations used

- Premium Reminder Call Script: Kalinga Protect > Objection: "Wala pa po akong pera" o "Sa sweldo pa po" [kb_ph_life_objection_fd5e66] (internal://servicing/premium-reminder-script-v2.0, v2.0, effective 2026-01-15)

## Check

PASS: every expectation in data/scenarios/calls.json met.
