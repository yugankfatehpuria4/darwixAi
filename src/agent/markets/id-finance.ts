import accounts from "../../../config/mock-accounts.json" with { type: "json" };
import rules from "../../../config/id-rules.json" with { type: "json" };
import { tokenize } from "../../text";
import { indonesianDate, indonesianDaypart, rupiahInWords } from "../locale";
import type { MarketPack } from "../market";
import { daysBetween, numbersIn, resolvePromiseDate, toIsoDate } from "../parse";
import type { CallState, Outcome } from "../types";

const account = accounts.id_finance;

// Two registers, both keeping "Bapak/Ibu" (the script forbids "kamu"):
// formal for the opening and for callers who speak formally or in Javanese
// krama / Sundanese lemes (polite registers; answering them casually would be
// rude), semi-formal "santai" once the caller is clearly casual.
// Amounts are spoken in words. Needs native-speaker review (GAP-005).
const lines: MarketPack["lines"] = {
  greeting: {
    formal: "Selamat {daypart}, {salutation}. Saya Sari, asisten virtual dari Danamaju Finance, terkait pembiayaan {vehicle} {salutation}. Untuk menjaga kualitas layanan, panggilan ini direkam. Apakah saya berbicara dengan {salutation} {full_name}?",
  },
  consent_repeat: {
    formal: "Mohon maaf, {salutation}, apakah benar saya berbicara dengan {salutation} {full_name}?",
    santai: "Maaf, {salutation}, betul ini dengan {salutation} {full_name}?",
  },
  declined: {
    // Etika penagihan: nothing about the debt is said to anyone but the customer.
    formal: "Mohon maaf atas gangguannya. Kami akan menghubungi kembali di lain waktu. Terima kasih, selamat {daypart}.",
  },
  ask_dob: {
    formal: "Terima kasih, {salutation}. Untuk verifikasi, mohon sebutkan tanggal lahir {salutation}.",
    santai: "Makasih, {salutation}. Buat verifikasi, boleh sebutkan tanggal lahirnya?",
  },
  verify_failed: {
    formal: "Mohon maaf, data tersebut belum sesuai dengan catatan kami. Boleh diulangi tanggal lahirnya, {salutation}?",
    santai: "Maaf, {salutation}, datanya belum cocok. Boleh diulang tanggal lahirnya?",
  },
  reminder: {
    formal: "Terima kasih, data sudah sesuai. Kami ingin mengingatkan bahwa angsuran ke-{installment_number} pembiayaan {vehicle} {salutation} sebesar {amount} akan jatuh tempo pada hari {due_date}. Denda keterlambatan sebesar 0,2 persen per hari berlaku mulai sehari setelah jatuh tempo.",
    santai: "Makasih, datanya sudah cocok. Mau ngingetin aja, {salutation}, angsuran ke-{installment_number} motornya sebesar {amount} jatuh tempo {due_date_short}. Kalau lewat dari tanggal itu, kena denda 0,2 persen per hari.",
  },
  ask_promise: {
    formal: "Rencananya {salutation} akan melakukan pembayaran kapan?",
    santai: "Kira-kira {salutation} bisa bayar kapan?",
  },
  ask_channel: {
    formal: "Pembayarannya akan melalui apa, {salutation}: virtual account, aplikasi Danamaju Mobile, minimarket, atau kantor cabang?",
    santai: "Bayarnya mau lewat apa, {salutation}: virtual account, aplikasi, minimarket, atau ke cabang?",
  },
  unclear: { formal: "Mohon maaf, suaranya kurang jelas. Bisa diulangi, {salutation}?", santai: "Maaf, kurang kedengaran. Bisa diulang, {salutation}?" },
  unclear_answer: { formal: "Mohon maaf, saya belum menangkap maksudnya.", santai: "Maaf, saya belum nangkap maksudnya." },
  silence: { formal: "Halo, {salutation}, apakah masih tersambung?", santai: "Halo, {salutation}, masih di sana?" },
  silence_end: { formal: "Sepertinya sambungan terputus. Kami akan menghubungi kembali. Terima kasih." },
  fallback: {
    formal: "Mohon maaf, saya belum memiliki informasi tersebut. Saya bisa menghubungkan {salutation} dengan petugas kami.",
    santai: "Maaf, {salutation}, untuk itu saya belum punya infonya. Saya bisa sambungkan ke petugas kami.",
  },
  conflict: {
    formal: "Mohon konfirmasi, {salutation}: tadi disebutkan {previous}, sekarang {incoming}. Yang benar {incoming}?",
    santai: "Maaf, {salutation}, tadi {previous}, sekarang {incoming}. Yang bener {incoming} ya?",
  },
  conflict_kept: { formal: "Baik, saya catat {value}.", santai: "Oke, saya catat {value} ya." },
  noted_skip: { formal: "Baik, tidak apa-apa. Nanti petugas kami yang menindaklanjuti.", santai: "Oke, nggak apa-apa. Nanti petugas kami yang lanjutin." },
  do_not_call: {
    formal: "Baik, {salutation}, permintaan tersebut kami catat dan akan ditindaklanjuti oleh petugas kami. Terima kasih.",
  },
  escalate_now: {
    formal: "Baik, {salutation}, saya alihkan ke petugas kami. Mohon ditunggu sebentar.",
    santai: "Oke, {salutation}, saya sambungkan ke petugas kami ya. Ditunggu sebentar.",
  },
  outcome_on_time: {
    formal: "Terima kasih, {salutation}. Saya catat pembayaran pada hari {promise_date}{channel_phrase}, sebelum jatuh tempo, jadi tidak ada denda. {posting_note}Terima kasih atas waktunya, selamat {daypart}.",
    santai: "Oke, makasih {salutation}. Saya catat bayarnya {promise_date_short}{channel_phrase}, masih sebelum jatuh tempo, jadi nggak kena denda. {posting_note}Makasih ya, {salutation}, selamat {daypart}.",
  },
  outcome_late: {
    formal: "Baik, {salutation}. Saya catat pembayaran pada hari {promise_date}, yaitu {days_late} hari setelah jatuh tempo, sehingga ada denda sekitar {late_fee}. Jika tanggal gajian {salutation} memang selalu setelah jatuh tempo, tanggal jatuh tempo bisa diubah satu kali selama tenor melalui kantor cabang atau call center, dengan biaya administrasi lima puluh ribu rupiah. Terima kasih, selamat {daypart}.",
    santai: "Oke, {salutation}, saya catat bayarnya {promise_date_short}, jadi telat {days_late} hari, dendanya sekitar {late_fee}. Kalau gajiannya memang selalu lewat dari jatuh tempo, tanggal jatuh temponya bisa diganti sekali selama tenor lewat cabang atau call center, biayanya lima puluh ribu rupiah. Makasih ya, {salutation}.",
  },
  outcome_hardship: {
    formal: "Kami turut prihatin, {salutation}. Saya jadwalkan petugas cabang untuk menghubungi {salutation} terkait program keringanan. Keputusan restrukturisasi ada di tim kredit, jadi saya belum bisa menjanjikan hasilnya. Semoga dimudahkan, {salutation}. Terima kasih.",
    santai: "Turut prihatin ya, {salutation}. Saya jadwalkan petugas cabang buat hubungi {salutation} soal program keringanan. Keputusannya di tim kredit, jadi saya belum bisa janji hasilnya. Semoga dimudahkan ya, {salutation}.",
  },
  outcome_incomplete: {
    formal: "Baik, {salutation}. Petugas kami akan menghubungi kembali sebelum jatuh tempo. Terima kasih, selamat {daypart}.",
  },
};

export const HARDSHIP = /\b(phk|di-?phk|kena phk|dipecat|kehilangan pekerjaan|nggak kerja lagi|udah nggak kerja|lagi sakit|sedang sakit|sakit|dirawat|opname|kena musibah|musibah|bencana|kebanjiran|banjir|kebakaran|usaha(nya)? (lagi )?sepi|bangkrut)\b/i;

const CHANNELS: Array<[RegExp, string, string]> = [
  [/\b(virtual account|va|transfer|m-?banking|mobile banking)\b/i, "virtual_account", " melalui virtual account"],
  [/\b(aplikasi|app|danamaju mobile)\b/i, "app", " melalui aplikasi Danamaju Mobile"],
  [/\b(indomaret|alfamart|minimarket|alfa)\b/i, "minimarket", " melalui minimarket"],
  [/\b(cabang|kantor)\b/i, "branch", " di kantor cabang"],
];

const COLLOQUIAL = new Set(["nggak", "gak", "ga", "enggak", "udah", "gimana", "aja", "sih", "dong", "kok", "nih", "banget", "gue", "gw", "lu", "bener", "makasih", "yaudah", "kayaknya", "kalo", "ngapain", "nyicil", "waduh", "duh"]);
const POLITE_REGIONAL = new Set(["nggih", "inggih", "mboten", "sampun", "dereng", "ngapunten", "kula", "saged", "punten", "pripun", "mangga", "hatur", "nuhun", "teh", "atuh", "upami"]);

const MONTHS: Record<string, number> = {
  januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6, juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, agu: 8, agt: 8, sep: 9, okt: 10, nov: 11, des: 12,
};

/** "12 Maret 1990", "12-03-1990", "12 3 1990" -> "1990-03-12" */
export function parseBirthDate(text: string): string | null {
  const lower = text.toLowerCase();
  const named = lower.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
  if (named && MONTHS[named[2]]) {
    return `${named[3]}-${String(MONTHS[named[2]]).padStart(2, "0")}-${named[1].padStart(2, "0")}`;
  }
  const numbers = numbersIn(lower);
  const yearIndex = numbers.findIndex((value) => value > 1900 && value < 2100);
  if (yearIndex >= 2) {
    const [day, month, year] = numbers.slice(yearIndex - 2, yearIndex + 1);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return null;
}

const dueDate = (state: CallState) => String(state.account!.due_date);

function decide(state: CallState): Outcome {
  const promise = state.slots.promise_date?.value;
  if (promise === "hardship") {
    return {
      status: "hardship_restructuring_callback",
      next_action: "branch_officer_callback_restructuring",
      reasons: ["customer reported hardship"],
      rule_sources: ["id/kebijakan/denda-keringanan-penagihan.md#Program keringanan (restrukturisasi)"],
      details: { due_date: dueDate(state) },
    };
  }
  if (typeof promise !== "string") {
    return { status: "no_commitment", next_action: "follow_up_before_due", reasons: ["no payment date given"], rule_sources: [], details: { due_date: dueDate(state) } };
  }
  const daysLate = daysBetween(dueDate(state), promise);
  const channel = state.slots.payment_channel?.value ?? null;
  if (daysLate <= 0) {
    return { status: "promise_on_time", next_action: "log_promise_to_pay", reasons: [`promise ${promise} on or before due ${dueDate(state)}`], rule_sources: [], details: { due_date: dueDate(state), promise_date: promise, channel } };
  }
  const lateFee = Math.round(Number(account.installment_idr) * rules.late_fee_rate_per_day.value * daysLate);
  return {
    status: "promise_late",
    next_action: "log_promise_to_pay_with_late_fee",
    reasons: [`promise ${promise} is ${daysLate} day(s) after due ${dueDate(state)}`],
    rule_sources: [rules.late_fee_rate_per_day.source, rules.due_date_change_fee_idr.source],
    details: { due_date: dueDate(state), promise_date: promise, days_late: daysLate, estimated_late_fee_idr: lateFee, channel },
  };
}

export const idFinancePack: MarketPack = {
  market: "id_finance",
  company: "Danamaju Finance",
  registers: {
    formal: { asr_locale: "id-ID", tts_locale: "id-ID", llm_instruction: "formal, polite Bahasa Indonesia addressing the customer as Bapak/Ibu" },
    santai: { asr_locale: "id-ID", tts_locale: "id-ID", llm_instruction: "friendly semi-formal spoken Bahasa Indonesia (nggak, udah are fine) but always addressing the customer as Bapak/Ibu, never kamu" },
  },
  default_register: "formal",
  detectRegister(text, current) {
    const tokens = tokenize(text);
    if (tokens.some((token) => POLITE_REGIONAL.has(token))) return "formal";
    if (tokens.some((token) => COLLOQUIAL.has(token))) return "santai";
    return current;
  },
  lines,
  slots: [
    {
      name: "date_of_birth",
      prompt: "ask_dob",
      required: true,
      extract: (text, asked) => (asked ? parseBirthDate(text) ?? undefined : undefined),
      verify: (value, state) => value === state.account?.date_of_birth,
    },
    {
      name: "promise_date",
      prompt: "ask_promise",
      required: true,
      extract(text, asked, state) {
        if (HARDSHIP.test(text)) return "hardship";
        if (!asked) return undefined;
        return resolvePromiseDate(text, new Date(`${state.today}T00:00:00Z`)) ?? undefined;
      },
      describe: (value, register) => (value === "hardship" ? "kesulitan pembayaran" : indonesianDate(String(value), register === "santai")),
    },
    {
      name: "payment_channel",
      prompt: "ask_channel",
      required: false,
      extract: (text) => CHANNELS.find(([pattern]) => pattern.test(text))?.[1],
    },
  ],
  objections: [
    {
      id: "not_paid_yet",
      pattern: /\b(belum gajian|nunggu gajian|tunggu gaji(an)?|gajian(nya)? (masih|nanti|tanggal)|dereng gajian|durung gajian|nanti dulu|belum ada uang|lagi nggak ada uang)\b/i,
      unless: HARDSHIP,
      query: "Keberatan belum gajian nanti dulu",
    },
    {
      id: "vehicle_broken",
      pattern: /\b(motor(nya)? (lagi |sedang )?(rusak|mogok|di ?bengkel)|lagi rusak|ngapain bayar)\b/i,
      query: "Keberatan motornya rusak ngapain bayar",
    },
  ],
  patterns: {
    escalation: /\b(petugas|orang asli|manusia|customer service|cs|operator|keluhan|komplain|supervisor|atasan)\b/i,
    do_not_call: /\b(jangan (telepon|telpon|hubungi) (saya )?lagi|stop (telepon|telpon)|jangan ganggu)\b/i,
    dont_know: /\b(belum tahu|belum tau|nggak tahu|nggak tau|gak tau|tidak tahu|belum pasti|mboten ngertos|teu terang)\b/i,
    correction: /\b(eh salah|maksud saya|ralat|eh maaf|bukan,? )\b/i,
  },
  max_unanswered_questions: rules.max_unanswered_questions.value,
  address_terms: { "Bapak/Ibu": "salutation" },
  setup(state) {
    const due = new Date(`${state.today}T00:00:00Z`);
    due.setUTCDate(due.getUTCDate() + account.due_in_days);
    state.account = { ...account, due_date: toIsoDate(due) };
    state.known_pii = [
      { value: account.full_name, label: "CUSTOMER_NAME" },
      { value: account.full_name.split(" ")[0], label: "CUSTOMER_NAME" },
    ];
  },
  vars(state) {
    const promise = state.slots.promise_date?.value;
    const hasPromiseDate = typeof promise === "string" && promise !== "hardship";
    const channel = CHANNELS.find(([, id]) => id === state.slots.payment_channel?.value);
    const lateFee = state.outcome?.details?.estimated_late_fee_idr as number | undefined;
    return {
      daypart: indonesianDaypart(new Date(state.started_at)),
      salutation: account.salutation,
      full_name: account.full_name,
      vehicle: account.vehicle,
      installment_number: String(account.installment_number),
      amount: rupiahInWords(account.installment_idr),
      due_date: indonesianDate(dueDate(state)),
      due_date_short: indonesianDate(dueDate(state), true),
      promise_date: hasPromiseDate ? indonesianDate(promise) : "",
      promise_date_short: hasPromiseDate ? indonesianDate(promise, true) : "",
      days_late: String(state.outcome?.details?.days_late ?? ""),
      late_fee: lateFee === undefined ? "" : rupiahInWords(lateFee),
      channel_phrase: channel ? channel[2] : "",
      posting_note: state.slots.payment_channel?.value === "minimarket" ? "Pembayaran di minimarket tercatat paling lambat satu kali dua puluh empat jam. " : "",
    };
  },
  afterSlot(slot, state) {
    if (slot === "date_of_birth") return "reminder";
    if (slot === "promise_date" && state.slots.promise_date?.value === "hardship") state.skipped.push("payment_channel");
    return null;
  },
  declined: { status: "wrong_person_no_disclosure", next_action: "retry_call_later", line: "declined" },
  decide,
  outcomeLine(outcome) {
    switch (outcome.status) {
      case "promise_on_time": return "outcome_on_time";
      case "promise_late": return "outcome_late";
      case "hardship_restructuring_callback": return "outcome_hardship";
      default: return "outcome_incomplete";
    }
  },
  escalationOutcome(_state, reason) {
    return {
      outcome: { status: "escalated_to_human", next_action: "officer_transfer_or_callback", reasons: [reason], rule_sources: ["id/scripts/skrip-pengingat-angsuran.md#Eskalasi"] },
      line: "escalate_now",
    };
  },
};
