# q3-id-03-javanese-hardship: Javanese-influenced polite speech (krama): job loss, restructuring callback, bot stays formal

Market `id_finance` | call `call_20261002_dadb7dd7` | clock 2026-10-02T07:00:00Z | text injected at the ASR output (no audio recognition in this run)

Covers: regional speech (Javanese krama lexicon); hardship; register kept formal

| # | Speaker | Text | Notes |
|---|---|---|---|
| 0 | bot | Selamat siang, Bapak. Saya Sari, asisten virtual dari Danamaju Finance, terkait pembiayaan sepeda motor Bapak. Untuk menjaga kualitas layanan, panggilan ini direkam. Apakah saya berbicara dengan Bapak [CUSTOMER_NAME]? | intent: greeting; register formal |
| 1 | customer | Nggih, leres, kula piyambak | intent: consent_yes |
| 2 | bot | Terima kasih, Bapak. Untuk verifikasi, mohon sebutkan tanggal lahir Bapak. | register formal |
| 3 | customer | 12 Maret 1990 | intent: slot:date_of_birth |
| 4 | bot | Terima kasih, data sudah sesuai. Kami ingin mengingatkan bahwa angsuran ke-9 pembiayaan sepeda motor Bapak sebesar satu juta dua ratus lima puluh ribu rupiah akan jatuh tempo pada hari Senin, 5 Oktober 2026. Denda keterlambatan sebesar 0,2 persen per hari berlaku mulai sehari setelah jatuh tempo. Rencananya Bapak akan melakukan pembayaran kapan? | register formal |
| 5 | customer | Ngapunten, kula kena PHK, dereng saged mbayar | intent: slot:promise_date |
| 6 | bot | Kami turut prihatin, Bapak. Saya jadwalkan petugas cabang untuk menghubungi Bapak terkait program keringanan. Keputusan restrukturisasi ada di tim kredit, jadi saya belum bisa menjanjikan hasilnya. Semoga dimudahkan, Bapak. Terima kasih. | register formal |

## Outcome

```json
{
  "status": "hardship_restructuring_callback",
  "next_action": "branch_officer_callback_restructuring",
  "reasons": [
    "customer reported hardship"
  ],
  "rule_sources": [
    "id/kebijakan/denda-keringanan-penagihan.md#Program keringanan (restrukturisasi)"
  ],
  "details": {
    "due_date": "2026-10-05"
  }
}
```

## Check

PASS: every expectation in data/scenarios/calls.json met.
