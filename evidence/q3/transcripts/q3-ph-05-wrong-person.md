# q3-ph-05-wrong-person: Someone else answers: the bot discloses nothing about the policy

Market `ph_life` | call `call_20261002_80517e50` | clock 2026-10-02T03:00:00Z | text injected at the ASR output (no audio recognition in this run)

Covers: privacy: no disclosure to third parties

| # | Speaker | Text | Notes |
|---|---|---|---|
| 0 | bot | Magandang umaga po! Si Lia po ito, virtual assistant ng Kalinga Life, partner ng Bayanihan Bank. Para po sa quality at training purposes, naka-record po ang tawag na ito. Si Ma'am [CUSTOMER_NAME] po ba ang kausap ko? | intent: greeting; register taglish |
| 1 | customer | Hindi po, kapatid niya po ako | intent: consent_no |
| 2 | bot | Ay, pasensya na po sa abala. Tatawag na lang po ulit kami. Salamat po, ingat po kayo. | register taglish |

## Outcome

```json
{
  "status": "wrong_person_no_disclosure",
  "next_action": "retry_call_later",
  "reasons": [
    "declined the opening question"
  ],
  "rule_sources": []
}
```

## Check

PASS: every expectation in data/scenarios/calls.json met.
