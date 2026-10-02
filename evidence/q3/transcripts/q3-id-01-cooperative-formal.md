# q3-id-01-cooperative-formal: Formal Bahasa Indonesia: verified, pays tomorrow by virtual account, before due date

Market `id_finance` | call `call_20261002_f966d66f` | clock 2026-10-02T02:00:00Z | text injected at the ASR output (no audio recognition in this run)

Covers: cooperative customer; formal register; amounts spoken in words

| # | Speaker | Text | Notes |
|---|---|---|---|
| 0 | bot | Selamat pagi, Bapak. Saya Sari, asisten virtual dari Danamaju Finance, terkait pembiayaan sepeda motor Bapak. Untuk menjaga kualitas layanan, panggilan ini direkam. Apakah saya berbicara dengan Bapak [CUSTOMER_NAME]? | intent: greeting; register formal |
| 1 | customer | Iya, benar, saya sendiri | intent: consent_yes |
| 2 | bot | Terima kasih, Bapak. Untuk verifikasi, mohon sebutkan tanggal lahir Bapak. | register formal |
| 3 | customer | Tanggal 12 Maret 1990 | intent: slot:date_of_birth |
| 4 | bot | Terima kasih, data sudah sesuai. Kami ingin mengingatkan bahwa angsuran ke-9 pembiayaan sepeda motor Bapak sebesar satu juta dua ratus lima puluh ribu rupiah akan jatuh tempo pada hari Senin, 5 Oktober 2026. Denda keterlambatan sebesar 0,2 persen per hari berlaku mulai sehari setelah jatuh tempo. Rencananya Bapak akan melakukan pembayaran kapan? | register formal |
| 5 | customer | Besok saya bayar melalui virtual account | intent: slot:promise_date,slot:payment_channel |
| 6 | bot | Terima kasih, Bapak. Saya catat pembayaran pada hari Sabtu, 3 Oktober 2026 melalui virtual account, sebelum jatuh tempo, jadi tidak ada denda. Terima kasih atas waktunya, selamat pagi. | register formal |

## Outcome

```json
{
  "status": "promise_on_time",
  "next_action": "log_promise_to_pay",
  "reasons": [
    "promise 2026-10-03 on or before due 2026-10-05"
  ],
  "rule_sources": [],
  "details": {
    "due_date": "2026-10-05",
    "promise_date": "2026-10-03",
    "channel": "virtual_account"
  }
}
```

## Check

PASS: every expectation in data/scenarios/calls.json met.
