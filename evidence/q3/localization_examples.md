# Q3 localization: written for the market, not translated

Each row starts from the intent (what the bot needs to achieve), shows what a literal translation of an English script line would produce, and then the line the bot actually says, with the reasoning. All bot lines below are copied from `src/agent/markets/ph-life.ts` and `src/agent/markets/id-finance.ts` and appear in the transcripts under `evidence/q3/transcripts/`. They were written by us, not by native speakers; GAP-005 asks for review before anything goes near a customer.

## Philippines: Kalinga Protect premium reminder (life insurance via Bayanihan Bank)

**1. Opening and identity check**

- Intent: greet, disclose the recording, confirm we are talking to the policyholder before saying anything about the policy.
- Literal translation of the English script: "Kumusta, nakikipag-usap ba ako kay Ana Reyes? Ang tawag na ito ay nire-record."
- What the bot says: "Magandang hapon po! Si Lia po ito, virtual assistant ng Kalinga Life, partner ng Bayanihan Bank. Para po sa quality at training purposes, naka-record po ang tawag na ito. Si Ma'am Reyes po ba ang kausap ko?"
- Why:
  - The greeting follows the Manila clock (umaga/tanghali/hapon/gabi).
  - "po" runs through every sentence, as the reminder script requires.
  - The customer is addressed as "Ma'am" plus surname, the norm in Philippine bank and insurance calls; the first name alone would be over-familiar.
  - The bank partner is named because bancassurance customers know the bank, not the insurer.
  - "Quality at training purposes" stays in English because that is how Filipino call centres say it.
- Transcript: `q3-ph-01`.

**2. Amount and due date**

- Intent: tell the customer how much is due and when.
- Literal translation of the English script: "Ang iyong premium na PHP 7350.00 ay dapat bayaran sa 10/07/2026."
- What the bot says: "...ang quarterly premium ng Kalinga Protect ninyo na 7,350 pesos ay due sa Miyerkules, ika-7 ng Oktubre."
- Why:
  - "Premium", "quarterly" and "due" stay in English, because that is what Filipinos actually say about insurance. A fully Tagalog version would sound like a government form.
  - The amount is said the way a person says it ("7,350 pesos"), not read out as a currency code.
  - The date is the ordinal form with the weekday ("Miyerkules, ika-7 ng Oktubre"). A numeric date such as 10/07 is ambiguous: the Philippines writes month first, much of Asia writes day first.
  - In English register it becomes "Wednesday, October 7" (month first).
- Code: `src/agent/locale.ts`.

**3. Grace period, said calmly**

- Intent: make the customer aware that a 31-day grace period exists, without threatening them.
- Literal translation of the English script: "Kung hindi ka magbabayad, mawawala ang iyong policy."
- What the bot says: "Kung sakaling ma-late po, may 31 days po kayong grace period mula sa due date."
- Why:
  - The script says to remind "nang mahinahon, hindi pananakot" (calmly, not as a threat).
  - "Kung sakaling ma-late po" ("in case you're a little late") is a hedge Filipinos use to avoid embarrassing the listener.
  - Lapse is explained only when the customer's promised date actually falls past the grace period (`q3-ph`, `promise_beyond_grace`).

**4. Hardship**

- Intent: acknowledge the customer's hardship and route them to an advisor without promising an outcome.
- Literal translation of the English script: "Pasensya. Isang advisor ang tatawag sa iyo."
- What the bot says: "Naiintindihan ko po, at pasensya na po sa pinagdadaanan ninyo. Ise-schedule ko po kayo ng callback sa isang Kalinga Life advisor para sa premium payment extension, hanggang 60 days... Ang advisor po ang mag-a-approve, kaya hindi ko po ito maipapangako."
- Why:
  - The bot acknowledges the hardship first ("sa pinagdadaanan ninyo", "what you're going through") before stating the process.
  - It keeps the plural-respectful "kayo/ninyo" rather than "ka/mo".
  - It states plainly that it cannot promise approval, as the policy requires.
- Transcript: `q3-ph-03`.

**5. Wrong person picks up**

- Intent: end the call without disclosing anything about the policy.
- Literal translation of the English script: "Pasensya, mali ang numero. Paalam."
- What the bot says: "Ay, pasensya na po sa abala. Tatawag na lang po ulit kami. Salamat po, ingat po kayo."
- Why:
  - Nothing about the policy is said. This is a privacy rule, and `tests/agent.test.ts` checks it.
  - "Ingat po kayo" ("take care") is the normal Filipino sign-off. Skipping it makes the call feel cut off.
- Transcript: `q3-ph-05`.

## Indonesia: Danamaju Finance pre-due instalment reminder (motorcycle financing)

**1. Opening**

- Intent: greet, disclose the recording, verify that we are speaking to the customer.
- Literal translation of the English script: "Halo, apakah ini Budi Santoso? Panggilan ini direkam."
- What the bot says: "Selamat siang, Bapak. Saya Sari, asisten virtual dari Danamaju Finance, terkait pembiayaan sepeda motor Bapak. Untuk menjaga kualitas layanan, panggilan ini direkam. Apakah saya berbicara dengan Bapak Budi Santoso?"
- Why:
  - "Selamat pagi/siang/sore/malam" follows the WIB clock. The greeting is the first thing a caller judges.
  - "Bapak/Ibu" plus the full name is expected in any finance call.
  - The bot says "asisten virtual" up front rather than hiding that it is a bot.
  - The purpose is stated as "terkait pembiayaan" (about your financing) without the word "tunggakan" (arrears) before identity is verified, which the collection-ethics policy requires.

**2. Amount and date**

- Intent: tell the customer the instalment amount and due date.
- Literal translation of the English script: "Cicilan Anda sebesar Rp1.250.000 jatuh tempo pada 05/10/2026."
- What the bot says: "...angsuran ke-9 pembiayaan sepeda motor Bapak sebesar satu juta dua ratus lima puluh ribu rupiah akan jatuh tempo pada hari Senin, 5 Oktober 2026."
- Why:
  - TTS voices read "Rp1.250.000" inconsistently: digit by digit, or with the dots as decimals. The amount is generated in words ("satu juta... rupiah"), with the Indonesian rules for "seratus/seribu" versus "satu juta".
  - The date is day-month-year with the weekday ("Senin, 5 Oktober 2026").
  - "Angsuran ke-9" (the 9th instalment) tells the customer where they are in the tenor.
  - "Anda" is avoided: in speech it sounds stiff and distant. "Bapak" is used instead.
- Code: `rupiahInWords`.

**3. Mirroring a casual caller without dropping respect**

- Intent: ask when the customer will pay.
- Literal translation of the English script: "Kapan kamu bisa bayar?"
- What the bot says:
  - Formal: "Rencananya Bapak akan melakukan pembayaran kapan?"
  - After the caller speaks casually ("Iya bener, saya Budi"): "Kira-kira Bapak bisa bayar kapan?"
- Why:
  - "Kamu" to a customer is rude, and the script forbids it.
  - When the caller is casual (nggak, udah, sih, nih), the bot relaxes its verbs and particles but keeps "Bapak".
  - Callers who use Javanese krama ("nggih, kula, ngapunten") or Sundanese lemes ("punten, muhun") are using a polite register, so the bot stays formal with them.
- Code: `detectRegister`; transcripts: `q3-id-02` (santai), `q3-id-03` (Javanese, formal), `q3-id-04` (Sundanese, formal).

**4. The "belum gajian" (not paid yet) objection**

- Intent: handle a customer who will pay after payday, which falls after the due date.
- Literal translation of the English script: "Pembayaran terlambat akan dikenakan denda."
- What the bot says: it acknowledges, explains that the 0.2% per day fee starts the day after the due date, offers the one-time due-date change for people paid after the due date, and closes with the actual estimated fee in words: "...jadi telat 5 hari, dendanya sekitar dua belas ribu lima ratus rupiah."
- Why:
  - Payday-driven late payment is the most common reason in this sector, and the policy has a specific remedy for it (moving the due date).
  - Stating the actual rupiah amount, computed in code from the configured rate, is more useful and less threatening than restating the rule.
- Transcript: `q3-id-02`.

**5. Hardship, including from a Javanese-speaking caller**

- Intent: acknowledge job loss and route to restructuring without promising an outcome.
- Literal translation of the English script: "Maaf. Petugas akan menghubungi Anda."
- What the bot says: "Kami turut prihatin, Bapak. Saya jadwalkan petugas cabang untuk menghubungi Bapak terkait program keringanan. Keputusan restrukturisasi ada di tim kredit, jadi saya belum bisa menjanjikan hasilnya. Semoga dimudahkan, Bapak."
- Why:
  - "Turut prihatin" is the standard expression of sympathy.
  - "Semoga dimudahkan" ("may things be made easy for you") is a common, warm close in Indonesian, with no literal English equivalent.
  - The bot says plainly that it cannot promise restructuring.
  - The Javanese input "kula kena PHK, dereng saged mbayar" is understood through the glossary (dereng = belum, saged = bisa).
  - The bot does not answer in Javanese: we have no Javanese TTS or reviewer, and a badly-registered Javanese reply is worse than polite Indonesian.
- Transcript: `q3-id-03`.

## What localization changed in the system, not just the wording

| Area | Philippines | Indonesia |
|---|---|---|
| Flow | Premium reminder with policy-number check (last 4) | Pre-due reminder with date-of-birth check |
| Identity rule | Nothing said about the policy before verification | Same, plus no debt details to third parties (collection ethics) |
| Business rule in code | Promise date vs due date vs 31-day grace end | Promise date vs due date; late fee = instalment x 0.2% x days late |
| Registers | Taglish (default), English | Formal (default, also for krama/lemes callers), santai |
| Speech locales | ASR fil-PH for the whole call; TTS fil-PH, en-PH in English register | ASR and TTS id-ID |
| KB | Taglish FAQ, English product/policy pages | Bahasa FAQ, policy and product pages |
| Fallback / escalation | Stays in the caller's register ("Pasensya na po, wala po akong impormasyon...") | Stays in register ("Mohon maaf, saya belum memiliki informasi tersebut...") |
