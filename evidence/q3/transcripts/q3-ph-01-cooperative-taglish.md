# q3-ph-01-cooperative-taglish: Taglish policyholder: verified, asks about late payment in Taglish, promises Friday via e-wallet

Market `ph_life` | call `call_20261002_5037e2f2` | clock 2026-10-02T02:00:00Z | text injected at the ASR output (no audio recognition in this run)

Covers: cooperative customer; Taglish code-switching; grounded Taglish FAQ answer; grace-period rule in code

| # | Speaker | Text | Notes |
|---|---|---|---|
| 0 | bot | Magandang umaga po! Si Lia po ito, virtual assistant ng Kalinga Life, partner ng Bayanihan Bank. Para po sa quality at training purposes, naka-record po ang tawag na ito. Si Ma'am [CUSTOMER_NAME] po ba ang kausap ko? | intent: greeting; register taglish |
| 1 | customer | Opo, ako po si [CUSTOMER_NAME] | intent: consent_yes |
| 2 | bot | Salamat po, Ma'am. Para po sa security, pwede ko po bang makuha ang huling apat na digits ng policy number ninyo? | register taglish |
| 3 | customer | 4821 | intent: slot:policy_last4 |
| 4 | bot | Salamat po, verified na po kayo. Tumatawag po ako para ipaalala na ang quarterly premium ng Kalinga Protect ninyo na 7,350 pesos ay due sa Miyerkules, ika-7 ng Oktubre. Kung sakaling ma-late po, may 31 days po kayong grace period mula sa due date. Kailan po kaya kayo makakapagbayad? | register taglish |
| 5 | customer | Ano po mangyayari kapag na-late ako ng bayad? | intent: question |
| 6 | bot | May 31 days po kayong grace period mula sa due date. Habang nasa grace period, active pa rin po ang coverage ninyo. Kailan po kaya kayo makakapagbayad? | register taglish; KB extractive, chunks `kb_ph_life_faq_e6edd1`, confidence 0.652 |
| 7 | customer | Sa Biyernes po ako magbabayad, sa GCash po | intent: slot:payment_date,slot:payment_channel |
| 8 | bot | Salamat po! Itatala ko po na magbabayad kayo sa Biyernes, ika-9 ng Oktubre sa e-wallet. Pasok pa po iyon sa grace period, kaya tuloy po ang coverage ninyo. Ipapadala po ang official receipt sa email at SMS. Salamat po, ingat po kayo! | register taglish |

## Outcome

```json
{
  "status": "promise_within_grace",
  "next_action": "log_promise_to_pay",
  "reasons": [
    "promise 2026-10-09 within grace period ending 2026-11-07"
  ],
  "rule_sources": [
    "ph/policies/payment-lapse-reinstatement.md#Grace period"
  ],
  "details": {
    "due_date": "2026-10-07",
    "grace_end": "2026-11-07",
    "promise_date": "2026-10-09",
    "channel": "e_wallet"
  }
}
```

## Citations used

- Mga Madalas Itanong: Kalinga Protect > Ano po ang mangyayari kapag na-late ako sa pagbayad ng premium? [kb_ph_life_faq_e6edd1] (internal://servicing/faq-taglish, v1.0, effective 2026-01-15)

## Check

PASS: every expectation in data/scenarios/calls.json met.
