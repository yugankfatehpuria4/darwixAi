# q3-id-04-sundanese-escalation: Sundanese-influenced speech asks about the late fee, then asks for an officer

Market `id_finance` | call `call_20261002_e92cd918` | clock 2026-10-02T08:30:00Z | text injected at the ASR output (no audio recognition in this run)

Covers: regional speech (Sundanese lexicon); human escalation in Indonesian

| # | Speaker | Text | Notes |
|---|---|---|---|
| 0 | bot | Selamat sore, Bapak. Saya Sari, asisten virtual dari Danamaju Finance, terkait pembiayaan sepeda motor Bapak. Untuk menjaga kualitas layanan, panggilan ini direkam. Apakah saya berbicara dengan Bapak [CUSTOMER_NAME]? | intent: greeting; register formal |
| 1 | customer | Muhun, leres | intent: consent_yes |
| 2 | bot | Terima kasih, Bapak. Untuk verifikasi, mohon sebutkan tanggal lahir Bapak. | register formal |
| 3 | customer | 12 Maret 1990 | intent: slot:date_of_birth |
| 4 | bot | Terima kasih, data sudah sesuai. Kami ingin mengingatkan bahwa angsuran ke-9 pembiayaan sepeda motor Bapak sebesar satu juta dua ratus lima puluh ribu rupiah akan jatuh tempo pada hari Senin, 5 Oktober 2026. Denda keterlambatan sebesar 0,2 persen per hari berlaku mulai sehari setelah jatuh tempo. Rencananya Bapak akan melakukan pembayaran kapan? | register formal |
| 5 | customer | Punten, upami telat mayar dendana sabaraha? | intent: question |
| 6 | bot | Denda keterlambatan sebesar 0,2% per hari dari angsuran yang tertunggak, dihitung mulai hari pertama setelah tanggal jatuh tempo. Rencananya Bapak akan melakukan pembayaran kapan? | register formal; KB extractive, chunks `kb_id_finance_faq_272f27`, confidence 0.336 |
| 7 | customer | Abdi hoyong ngobrol sareng petugas wae | intent: escalation_request |
| 8 | bot | Baik, Bapak, saya alihkan ke petugas kami. Mohon ditunggu sebentar. | register formal |

## Outcome

```json
{
  "status": "escalated_to_human",
  "next_action": "officer_transfer_or_callback",
  "reasons": [
    "customer asked for a human"
  ],
  "rule_sources": [
    "id/scripts/skrip-pengingat-angsuran.md#Eskalasi"
  ]
}
```

## Citations used

- Pertanyaan Umum Pelanggan > Kalau telat bayar cicilan, kena denda berapa? [kb_id_finance_faq_272f27] (internal://cc/faq-pelanggan, v1.0, effective 2026-02-01)

## Check

PASS: every expectation in data/scenarios/calls.json met.
