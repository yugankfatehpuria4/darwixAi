import { HARDSHIP as ID_HARDSHIP } from "../agent/markets/id-finance";
import { HARDSHIP as PH_HARDSHIP } from "../agent/markets/ph-life";
import type { Category, Market } from "../kb/types";
import type { TranscriptSegment } from "./asr";

export type Priority = "high" | "medium" | "low";

export interface Signal {
  topic: string;
  priority: Priority;
  /** How sure the detector is, before the recogniser's own confidence is applied. */
  detector_confidence: number;
  segment: TranscriptSegment;
  evidence: string;
  nudge: string;
  /**
   * Business content the nudge should cite. requires_kb: no citation, no
   * nudge (sales and objection advice). Compliance and risk nudges come from
   * rules and fire even if the citation lookup misses.
   */
  kb?: { query: string; categories?: Category[]; audience?: "customer" | "agent"; requires_kb: boolean };
  /** Agent wording that shows the agent has acted on it. */
  resolved_by?: RegExp;
  ttl_ms: number;
}

export interface Insight {
  kind: "sentiment" | "topic_shift";
  segment_index: number;
  speaker: string;
  value: string | number;
}

/** What the detectors remember about the call so far. */
export interface CallContext {
  market: Market;
  recording_disclosed: boolean;
  identity_verified: boolean;
  waiting_period_disclosed: boolean;
  hardship: boolean;
  frustration: number;
}

export function newContext(market: Market): CallContext {
  return { market, recording_disclosed: false, identity_verified: false, waiting_period_disclosed: false, hardship: false, frustration: 0 };
}

const RECORDING_NOTICE = /\b(recorded|naka-?record|direkam|rekam)\b/i;
const IDENTITY_CHECK: Partial<Record<Market, RegExp>> = {
  ph_life: /\b(last four|huling apat|verification|verify)\b/i,
  id_finance: /\b(tanggal lahir|verifikasi|konfirmasi data)\b/i,
};
// Agent turns that collect personal data or talk about the account. Before
// any of these, the recording notice has to have been given.
const PERSONAL_OR_ACCOUNT: Record<Market, RegExp> = {
  in_health: /\b(your age|how old|which city|date of birth|who do you want to cover|who would you like to cover|medical condition)\b/i,
  ph_life: /\b(premium|due|policy number|last four)\b/i,
  id_finance: /\b(angsuran|tunggakan|jatuh tempo|cicilan|dibayar|tanggal lahir)\b/i,
};
const ACCOUNT_DETAILS: Partial<Record<Market, RegExp>> = {
  ph_life: /\b(premium|due|pesos|lapse)\b/i,
  id_finance: /\b(angsuran|tunggakan|jatuh tempo|cicilan|denda)\b/i,
};
// A quote is an amount AND a period ("fifteen thousand rupees a year"); "one
// hospital stay can cost several lakh rupees" is not a quote.
const PRICE = /\b(rs\.?\s?\d[\d,]*|(?!several\b|few\b|many\b|some\b)[\w-]+ (thousand|hundred|lakh) rupees|\d[\d,]* rupees)\b.*\b(a year|per year|annual(ly)?|a month|per month|yearly|monthly)\b/i;
const WAITING_DISCLOSURE = /waiting period/i;
const PROHIBITED_PROMISE = /\b(definitely|guarantee[ds]?|hundred percent|100 ?%|sure to be|for sure|pasti|dijamin|sigurado|siguradong)\b.*\b(approv\w*|paid|claim|setuju\w*|disetujui|cair|klaim)\b|\b(claim|klaim)\b.*\b(definitely|guarantee[ds]?|pasti|dijamin|sigurado)\b/i;
const THREAT = /\b(kami tarik|akan (kami )?tarik|ditarik|disita|kami sita|lapor(kan)? (ke )?polisi|datangi rumah|kami datangi|proses hukum)\b/i;

// "A bit expensive" is weaker evidence than "too expensive, I can't afford it".
const SOFT_PRICE_CONCERN = /\b(expensive|costly|pricey|mahal|kemahalan)\b/i;
const PRICE_OBJECTION = /\b(too expensive|so expensive|too costly|can'?t afford|cannot afford|too much for us|ang mahal|masyadong mahal|kemahalan|mahal banget|terlalu mahal)\b/i;
const EMPLOYER_OBJECTION = /\b(company|office|employer)\b.*\b(already|gives|provides)\b.*\b(insurance|cover)\b|\balready have\b.*\b(office|company|employer)\b/i;
const NEGATED_NEED = /\b(already have|have their own|has (his|her|their) own|sudah punya|sudah ada|meron na|may sarili)\b/i;

const PARENTS_UNINSURED = /\b(parents?|mother|father|in-?laws?)\b.*\b(don'?t|do not|doesn'?t|no|without)\b.*\b(insurance|cover|policy)\b/i;
const PARENTS_MENTION = /\b(my )?(parents?|mother|father|mom|dad|in-?laws?)\b/i;
const MATERNITY = /\b(pregnant|expecting|baby on the way|planning a baby)\b/i;
const LIFE_EVENT = /\b(kakapanganak|nanganak|bagong baby|baby girl|baby boy|new baby|newborn|ikinasal|kinasal|got married|bagong kasal)\b/i;
const SECOND_FINANCING = /\b(motor kedua|kendaraan kedua|mobil|renovasi|biaya sekolah|pendidikan anak|second (motorbike|bike|vehicle))\b/i;

const BUYING = /\b(how do i sign up|how do i apply|send me the quote|sounds good|let'?s do it|i'?m interested|paano mag-?apply|sige,? kukunin ko|gimana cara daftar|mau daftar|boleh saya ajukan)\b/i;
const CALLBACK = /\b(call me (back )?(later|tomorrow|after|next|in the evening)|pakitawagan|tawagan (niyo |n'?yo |na lang )?(ako|na lang)|telepon saya lagi|tolong telepon|hubungi (saya )?(lagi|besok)|after \d{1,2} ?(pm|am))\b/i;

// Frustration markers. Weighted: repeating oneself and direct complaints
// say more than a single negative word.
const FRUSTRATION_STRONG = /\b(already told you|how many times|i told you|sudah saya bilang|kan sudah bilang|berkali-kali|ilang beses|paulit-ulit|sinabi ko na)\b/i;
const FRUSTRATION_WORDS = /\b(annoying|ridiculous|useless|frustrat\w*|fed up|stop calling|ribet|capek|kesel|kesal|nyebelin|kenapa .* terus|nakakainis|nakakairita|bwisit|ayoko na)\b/gi;

const POSITIVE = /\b(thank|thanks|great|good|okay|sure|salamat|sige|terima kasih|makasih|baik|oke|mantap)\b/gi;
const NEGATIVE = /\b(no|not|can'?t|problem|expensive|worried|hindi|wala|mahal|nggak|tidak|susah|capek|ribet|marah)\b/gi;

export function sentimentOf(text: string): number {
  const positive = text.match(POSITIVE)?.length ?? 0;
  const negative = text.match(NEGATIVE)?.length ?? 0;
  return positive + negative === 0 ? 0 : Number(((positive - negative) / (positive + negative)).toFixed(2));
}

const hardshipPattern: Record<Market, RegExp | null> = { in_health: null, ph_life: PH_HARDSHIP, id_finance: ID_HARDSHIP };

/**
 * Runs every detector over one final transcript segment. Detectors are
 * rules over the transcript plus call context: cheap enough to run on every
 * segment inside the latency budget, and each one can be explained by
 * pointing at the pattern that fired.
 */
export function detectSignals(segment: TranscriptSegment, context: CallContext): Signal[] {
  const signals: Signal[] = [];
  const text = segment.text;
  const add = (signal: Omit<Signal, "segment">) => signals.push({ ...signal, segment });

  if (segment.speaker === "agent") {
    const asksPersonal = PERSONAL_OR_ACCOUNT[context.market].test(text);
    if (RECORDING_NOTICE.test(text)) context.recording_disclosed = true;
    else if (asksPersonal && !context.recording_disclosed) {
      add({
        topic: "compliance:recording_disclosure",
        priority: "high",
        detector_confidence: 0.9,
        evidence: text,
        nudge: "Recording notice not given yet. Say it before collecting any more details.",
        kb: { query: context.market === "id_finance" ? "pemberitahuan rekaman panggilan ini direkam" : context.market === "ph_life" ? "recording disclosure naka-record ang tawag" : "call recording disclosure", categories: ["compliance"], requires_kb: false },
        resolved_by: RECORDING_NOTICE,
        ttl_ms: 120_000,
      });
    }
    const identityCheck = IDENTITY_CHECK[context.market];
    if (identityCheck?.test(text)) context.identity_verified = true;
    const accountDetails = ACCOUNT_DETAILS[context.market];
    if (identityCheck && accountDetails?.test(text) && !context.identity_verified) {
      add({
        topic: "compliance:identity_before_details",
        priority: "high",
        detector_confidence: 0.85,
        evidence: text,
        nudge: "Account details mentioned before identity verification. Verify identity before saying anything more about the account.",
        kb: { query: context.market === "id_finance" ? "verifikasi identitas tanggal lahir sebelum informasi kontrak" : "identity check last four digits policy number", categories: ["compliance"], requires_kb: false },
        ttl_ms: 60_000,
      });
    }
    if (WAITING_DISCLOSURE.test(text)) context.waiting_period_disclosed = true;
    if (context.market === "in_health" && PRICE.test(text) && !context.waiting_period_disclosed) {
      add({
        topic: "compliance:price_before_disclosure",
        priority: "high",
        detector_confidence: 0.85,
        evidence: text,
        nudge: "Price given before the waiting-period disclosure. State the waiting periods now.",
        kb: { query: "waiting period disclosure before price quote", categories: ["compliance"], requires_kb: false },
        resolved_by: WAITING_DISCLOSURE,
        ttl_ms: 90_000,
      });
    }
    if (PROHIBITED_PROMISE.test(text)) {
      add({
        topic: "risk:prohibited_promise",
        priority: "high",
        detector_confidence: 0.9,
        evidence: text,
        nudge: "Risky statement: claim approval cannot be promised. Correct it: decisions depend on the policy terms.",
        kb: { query: context.market === "in_health" ? "prohibited statements never guarantee claim approval" : "never promise approval", categories: ["compliance", "objection"], requires_kb: false },
        ttl_ms: 60_000,
      });
    }
    if (context.market === "id_finance" && THREAT.test(text)) {
      add({
        topic: "risk:threat",
        priority: "high",
        detector_confidence: 0.9,
        evidence: text,
        nudge: "Threat to the customer (repossession). Collection rules forbid threats. Apologise and move to the hardship programme.",
        kb: { query: "etika penagihan dilarang ancaman kata kasar", categories: ["compliance"], requires_kb: false },
        ttl_ms: 60_000,
      });
    }
    return signals;
  }

  const hardship = hardshipPattern[context.market];
  if (hardship?.test(text)) {
    context.hardship = true;
    add({
      topic: "payment:difficulty",
      priority: "high",
      detector_confidence: 0.85,
      evidence: text,
      nudge: context.market === "id_finance"
        ? "Customer reports hardship. Offer the restructuring programme via a branch officer callback; do not promise approval."
        : "Customer reports hardship. Offer a callback for a premium payment extension (up to 60 days, before the grace period ends); do not promise approval.",
      kb: { query: context.market === "id_finance" ? "program keringanan restrukturisasi kesulitan pembayaran" : "hardship assistance premium payment extension", audience: "customer", requires_kb: true },
      resolved_by: /\b(keringanan|restrukturisasi|extension|callback|petugas cabang|advisor)\b/i,
      ttl_ms: 90_000,
    });
  }

  if (PRICE_OBJECTION.test(text) || SOFT_PRICE_CONCERN.test(text)) {
    add({
      topic: "objection:price",
      priority: "medium",
      detector_confidence: PRICE_OBJECTION.test(text) ? 0.8 : 0.55,
      evidence: text,
      nudge: "Price objection. Use the approved response: cost of one hospital stay, lower cover, floater, 10% family discount, monthly auto-debit.",
      kb: { query: "objection the premium is too expensive", categories: ["objection"], audience: "agent", requires_kb: true },
      ttl_ms: 45_000,
    });
  } else if (EMPLOYER_OBJECTION.test(text) && context.market === "in_health") {
    add({
      topic: "objection:employer_cover",
      priority: "medium",
      detector_confidence: 0.75,
      evidence: text,
      nudge: "Employer-cover objection. Explain that employer cover ends with the job; suggest a personal policy or a Super Top-Up.",
      kb: { query: "objection I already have health cover from my employer", categories: ["objection"], audience: "agent", requires_kb: true },
      ttl_ms: 45_000,
    });
  }

  if (context.market === "in_health" && !NEGATED_NEED.test(text)) {
    const uninsured = PARENTS_UNINSURED.test(text);
    if (uninsured || PARENTS_MENTION.test(text)) {
      add({
        topic: "opportunity:parents_cover",
        priority: "low",
        // A bare mention of parents is weak evidence; "they have no insurance" is strong.
        detector_confidence: uninsured ? 0.85 : 0.5,
        evidence: text,
        nudge: "Customer mentioned parents without cover. Parents up to 65 can be added to Family Shield; above 65 needs the senior plan.",
        kb: { query: "parents cover add parents up to 65 years", audience: "customer", requires_kb: true },
        resolved_by: /\b(parents? can be added|add (your )?parents|senior (citizen )?plan|top-?up)\b/i,
        ttl_ms: 60_000,
      });
    }
    if (MATERNITY.test(text)) {
      add({
        topic: "opportunity:maternity",
        priority: "low",
        detector_confidence: 0.8,
        evidence: text,
        nudge: "Customer mentioned a pregnancy or baby plans. Mention the maternity add-on (2-year waiting period).",
        kb: { query: "maternity cover add-on", audience: "customer", requires_kb: true },
        resolved_by: /\bmaternity\b/i,
        ttl_ms: 60_000,
      });
    }
  }
  if (context.market === "ph_life" && LIFE_EVENT.test(text)) {
    add({
      topic: "opportunity:life_event",
      priority: "low",
      detector_confidence: 0.85,
      evidence: text,
      nudge: "Life event (new baby). Offer a beneficiary review and mention riders such as Critical Illness.",
      kb: { query: "beneficiaries change revocable irrevocable rider", audience: "customer", requires_kb: true },
      resolved_by: /\b(beneficiar\w*|rider)\b/i,
      ttl_ms: 90_000,
    });
  }
  if (context.market === "id_finance" && SECOND_FINANCING.test(text)) {
    add({
      topic: "opportunity:second_financing",
      priority: "low",
      detector_confidence: 0.8,
      evidence: text,
      nudge: "Customer mentioned a second vehicle. Pembiayaan Multiguna is available after 12 months of on-time payments.",
      kb: { query: "pembiayaan multiguna kendaraan kedua", audience: "customer", requires_kb: true },
      resolved_by: /\bmultiguna\b/i,
      ttl_ms: 60_000,
    });
  }

  if (BUYING.test(text)) {
    add({
      topic: "opportunity:buying_signal",
      priority: "medium",
      detector_confidence: 0.8,
      evidence: text,
      nudge: "Buying signal. Confirm the next step now: written quote and advisor follow-up.",
      ttl_ms: 45_000,
    });
  }
  if (CALLBACK.test(text)) {
    add({
      topic: "callback:requested",
      priority: "medium",
      detector_confidence: 0.85,
      evidence: text,
      nudge: context.market === "id_finance"
        ? "Callback requested. Confirm a time within permitted calling hours (Mon-Sat 08:00-20:00)."
        : "Callback requested. Confirm the time and log it before ending the call.",
      kb: context.market === "id_finance" ? { query: "etika penagihan jam telepon 08.00 sampai 20.00", categories: ["compliance"], requires_kb: false } : undefined,
      ttl_ms: 60_000,
    });
  }

  // Rolling frustration: decays each customer turn, rises with repetition,
  // complaints, exclamations and talking over the agent. A nudge fires only
  // when the score is high AND this turn added to it (rising, not residual).
  const strong = FRUSTRATION_STRONG.test(text) ? 1.2 : 0;
  const words = (text.match(FRUSTRATION_WORDS)?.length ?? 0) * 0.6;
  const exclaim = text.includes("!") ? 0.3 : 0;
  const interrupt = segment.interrupted_previous ? 0.5 : 0;
  const added = strong + words + exclaim + interrupt;
  context.frustration = context.frustration * 0.6 + added;
  if (added > 0 && context.frustration >= 1.5) {
    add({
      topic: "customer:frustration",
      priority: "medium",
      detector_confidence: Math.min(0.95, 0.5 + context.frustration / 5),
      evidence: text,
      nudge: "Rising frustration (repeating themselves, interrupting). Stop pushing; acknowledge the concern before continuing.",
      ttl_ms: 45_000,
    });
  }
  return signals;
}
