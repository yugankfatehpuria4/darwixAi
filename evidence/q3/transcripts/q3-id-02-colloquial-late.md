# q3-id-02-colloquial-late: Colloquial caller, "belum gajian" objection, pays on the 10th: late fee computed in code and spoken in words

Market `id_finance` | call `call_20261002_3eb04a29` | clock 2026-10-02T04:00:00Z | text injected at the ASR output (no audio recognition in this run)

Covers: sector-specific objection; colloquial speech; finance loanwords (DP, tenor); deterministic late-fee rule

| # | Speaker | Text | Notes |
|---|---|---|---|
| 0 | bot | Selamat siang, Bapak. Saya Sari, asisten virtual dari Danamaju Finance, terkait pembiayaan sepeda motor Bapak. Untuk menjaga kualitas layanan, panggilan ini direkam. Apakah saya berbicara dengan Bapak [CUSTOMER_NAME]? | intent: greeting; register formal |
| 1 | customer | Iya bener, saya [CUSTOMER_NAME] | intent: consent_yes |
| 2 | bot | Makasih, Bapak. Buat verifikasi, boleh sebutkan tanggal lahirnya? | register santai |
| 3 | customer | 12 3 1990 | intent: slot:date_of_birth |
| 4 | bot | Makasih, datanya sudah cocok. Mau ngingetin aja, Bapak, angsuran ke-9 motornya sebesar satu juta dua ratus lima puluh ribu rupiah jatuh tempo tanggal 5 Oktober. Kalau lewat dari tanggal itu, kena denda 0,2 persen per hari. Kira-kira Bapak bisa bayar kapan? | register santai |
| 5 | customer | Kalau telat dendanya berapa sih? | intent: question |
| 6 | bot | Denda keterlambatan sebesar 0,2% per hari dari angsuran yang tertunggak, dihitung mulai hari pertama setelah tanggal jatuh tempo. Jadi semakin cepat dibayar, semakin kecil dendanya. Kira-kira Bapak bisa bayar kapan? | register santai; KB extractive, chunks `kb_id_finance_faq_272f27`, confidence 0.46 |
| 7 | customer | Waduh belum gajian nih, gajiannya tanggal 10 | intent: objection:not_paid_yet,slot:promise_date |
| 8 | bot | Baik, Bapak, saya mengerti. Sebagai info, denda 0,2% per hari mulai berlaku sehari setelah jatuh tempo. Kalau tanggal gajian Bapak memang selalu setelah jatuh tempo, tanggal jatuh temponya bisa diubah satu kali selama tenor, dengan biaya administrasi Rp50.000. Bayarnya mau lewat apa, Bapak: virtual account, aplikasi, minimarket, atau ke cabang? | register santai; KB extractive, chunks `kb_id_finance_objection_c97ff2`, confidence 0.504 |
| 9 | customer | Lewat Alfamart aja | intent: slot:payment_channel |
| 10 | bot | Oke, Bapak, saya catat bayarnya tanggal 10 Oktober, jadi telat 5 hari, dendanya sekitar dua belas ribu lima ratus rupiah. Kalau gajiannya memang selalu lewat dari jatuh tempo, tanggal jatuh temponya bisa diganti sekali selama tenor lewat cabang atau call center, biayanya lima puluh ribu rupiah. Makasih ya, Bapak. | register santai |

## Outcome

```json
{
  "status": "promise_late",
  "next_action": "log_promise_to_pay_with_late_fee",
  "reasons": [
    "promise 2026-10-10 is 5 day(s) after due 2026-10-05"
  ],
  "rule_sources": [
    "id/kebijakan/denda-keringanan-penagihan.md#Jatuh tempo dan denda keterlambatan",
    "id/kebijakan/denda-keringanan-penagihan.md#Perubahan tanggal jatuh tempo"
  ],
  "details": {
    "due_date": "2026-10-05",
    "promise_date": "2026-10-10",
    "days_late": 5,
    "estimated_late_fee_idr": 12500,
    "channel": "minimarket"
  }
}
```

## Citations used

- Pertanyaan Umum Pelanggan > Kalau telat bayar cicilan, kena denda berapa? [kb_id_finance_faq_272f27] (internal://cc/faq-pelanggan, v1.0, effective 2026-02-01)
- Skrip Pengingat Angsuran (Pre-Due Reminder) > Keberatan: "Belum gajian" atau "Nanti dulu ya" [kb_id_finance_objection_c97ff2] (internal://collection/skrip-pengingat-v2.1, v2.1, effective 2026-02-01)

## Check

PASS: every expectation in data/scenarios/calls.json met.
