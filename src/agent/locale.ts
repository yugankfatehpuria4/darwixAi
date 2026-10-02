// Spoken formats per market. These are where literal translation fails most
// visibly: "PHP 7350.00" or "Rp1.250.000" read out by a TTS voice sounds
// nothing like how an agent in Manila or Surabaya would say the amount.

const TL_MONTHS = ["Enero", "Pebrero", "Marso", "Abril", "Mayo", "Hunyo", "Hulyo", "Agosto", "Setyembre", "Oktubre", "Nobyembre", "Disyembre"];
const TL_DAYS = ["Linggo", "Lunes", "Martes", "Miyerkules", "Huwebes", "Biyernes", "Sabado"];
const ID_MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const ID_DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const EN_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const parts = (iso: string) => {
  const date = new Date(`${iso}T00:00:00Z`);
  return { day: date.getUTCDate(), month: date.getUTCMonth(), weekday: date.getUTCDay(), year: date.getUTCFullYear() };
};

/** "Martes, ika-7 ng Oktubre" */
export function tagalogDate(iso: string): string {
  const { day, month, weekday } = parts(iso);
  return `${TL_DAYS[weekday]}, ika-${day} ng ${TL_MONTHS[month]}`;
}

/** "Tuesday, October 7" (PH English puts the month first) */
export function philippineEnglishDate(iso: string): string {
  const { day, month, weekday } = parts(iso);
  return `${EN_DAYS[weekday]}, ${EN_MONTHS[month]} ${day}`;
}

/** Formal: "Senin, 5 Oktober 2026". Casual drops the weekday and year: "tanggal 5 Oktober". */
export function indonesianDate(iso: string, casual = false): string {
  const { day, month, weekday, year } = parts(iso);
  return casual ? `tanggal ${day} ${ID_MONTHS[month]}` : `${ID_DAYS[weekday]}, ${day} ${ID_MONTHS[month]} ${year}`;
}

/** "7,350 pesos": how the amount is said, not how it is printed on a statement. */
export function pesos(amount: number): string {
  return `${amount.toLocaleString("en-PH")} pesos`;
}

const ID_UNITS = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];

function belowThousand(value: number): string {
  if (value < 12) return ID_UNITS[value];
  if (value < 20) return `${ID_UNITS[value - 10]} belas`;
  if (value < 100) return `${ID_UNITS[Math.floor(value / 10)]} puluh ${ID_UNITS[value % 10]}`.trim();
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  return `${hundreds === 1 ? "seratus" : `${ID_UNITS[hundreds]} ratus`} ${belowThousand(rest)}`.trim();
}

/**
 * 1250000 -> "satu juta dua ratus lima puluh ribu rupiah". Indonesian says
 * "seratus" and "seribu", not "satu ratus"/"satu ribu"; but "satu juta".
 */
export function rupiahInWords(amount: number): string {
  const rounded = Math.round(amount);
  if (rounded === 0) return "nol rupiah";
  const millions = Math.floor(rounded / 1_000_000);
  const thousands = Math.floor((rounded % 1_000_000) / 1000);
  const rest = rounded % 1000;
  const words = [
    millions ? `${belowThousand(millions)} juta` : "",
    thousands ? (thousands === 1 ? "seribu" : `${belowThousand(thousands)} ribu`) : "",
    rest ? belowThousand(rest) : "",
  ];
  return `${words.filter(Boolean).join(" ")} rupiah`;
}

function localHour(now: Date, utcOffsetMinutes: number): number {
  return new Date(now.getTime() + utcOffsetMinutes * 60_000).getUTCHours();
}

/** Philippine time is UTC+8. */
export function tagalogDaypart(now: Date): { tl: string; en: string } {
  const hour = localHour(now, 480);
  if (hour < 12) return { tl: "umaga", en: "morning" };
  if (hour < 13) return { tl: "tanghali", en: "afternoon" };
  if (hour < 18) return { tl: "hapon", en: "afternoon" };
  return { tl: "gabi", en: "evening" };
}

/**
 * Assumes WIB (UTC+7). Customers in WITA/WIT zones would hear the wrong
 * greeting an hour or two off; the account's region should drive this.
 */
export function indonesianDaypart(now: Date): string {
  const hour = localHour(now, 420);
  if (hour < 11) return "pagi";
  if (hour < 15) return "siang";
  if (hour < 18) return "sore";
  return "malam";
}
