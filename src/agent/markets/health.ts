import { readFileSync } from "node:fs";
import rules from "../../../config/health-rules.json" with { type: "json" };
import type { MarketPack } from "../market";
import { numbersIn, yesNo } from "../parse";
import type { CallState, Outcome } from "../types";

// Spoken lines follow the Family Shield lead-qualification script v3.1
// (data/raw/health/scripts). tests/agent.test.ts checks that every number in
// these lines appears somewhere in the in_health knowledge base.
const lines: MarketPack["lines"] = {
  greeting: { en: "Hello, this is Asha, a virtual assistant from Suraksha Health Insurance, calling about the health insurance enquiry you submitted. This call is recorded for quality and training purposes. Is this a good time to talk for about five minutes?" },
  consent_repeat: { en: "Sorry, I just need a yes or no: is it okay to continue now? The call is recorded for quality and training purposes." },
  ask_members: { en: "First, who would you like to cover: just yourself, or also your spouse, children or parents?" },
  ask_age: { en: "What is the age of the eldest person to be covered?" },
  ask_city: { en: "Which city do you live in?" },
  ask_ped: { en: "Does anyone to be covered have an existing medical condition, such as diabetes, blood pressure, thyroid or asthma?" },
  ask_existing: { en: "Do you have any existing health insurance, including cover from your employer?" },
  ask_sum: { en: "Last one: which cover amount are you looking at, 5, 10, 15 or 25 lakh rupees? You can also say not sure." },
  unclear: { en: "Sorry, I didn't catch that. Could you say it again?" },
  unclear_answer: { en: "Sorry, I didn't quite get that." },
  silence: { en: "Are you still there?" },
  silence_end: { en: "It seems we got disconnected. An advisor will call you back. Goodbye." },
  fallback: { en: "I'm sorry, I don't have that information. I can connect you to an advisor who does." },
  conflict: { en: "Just to check: earlier you said {previous}, and now {incoming}. Is {incoming} correct?" },
  conflict_kept: { en: "Okay, I'll keep {value}." },
  noted_skip: { en: "That's fine, we can leave that for the advisor." },
  declined: { en: "No problem at all. I'll arrange for an advisor to call you back at a better time. Thank you, goodbye." },
  do_not_call: { en: "Understood. I've noted that you don't want any more calls, and we won't call this number again. Goodbye." },
  callback_requested: { en: "I've noted that. Thank you for your time, goodbye." },
  waiting_disclosure: { en: "Please note: illnesses are covered after a 30-day waiting period, and pre-existing diseases after 3 years." },
  outcome_qualified: { en: "Thank you, {name_hint}that's everything I need. You're eligible to apply for Family Shield. {disclosure}{premium_line}I'll send you a written quote by email or WhatsApp within 15 minutes, and an advisor will confirm the final premium. Thank you for your time, goodbye." },
  outcome_review: { en: "Thank you for telling me. Because a medical condition was declared, an underwriter needs to review this before we can quote. This is not a rejection. I've scheduled an underwriter to call you back within 2 working days. Thank you, goodbye." },
  outcome_senior: { en: "Thank you. Family Shield covers adults up to 65 years at entry, so for someone aged {age} there is a separate senior citizen plan handled by a specialist advisor. I've asked a specialist to call you back. Thank you, goodbye." },
  outcome_underage: { en: "Thank you. The person buying the policy needs to be at least 18 years old, so I can't take this further on this call. An advisor can explain the options. Thank you, goodbye." },
  outcome_incomplete: { en: "No problem. I don't have all the details yet, so an advisor will call you back within 2 working days to complete them. Thank you, goodbye." },
  escalate_now: { en: "Of course. I'm transferring you to a senior advisor now. Please stay on the line." },
  escalate_callback: { en: "Our advisors are available Monday to Saturday, 9 am to 8 pm. I've scheduled a callback for the next working day. Thank you, goodbye." },
};

const MEMBER_WORDS: Array<[RegExp, string]> = [
  [/\b(me|myself|self|i am|just me|only me|i)\b/i, "self"],
  [/\b(wife|husband|spouse|partner)\b/i, "spouse"],
  [/\b(kids?|child|children|son|sons|daughters?|baby)\b/i, "children"],
  [/\b(parents?|mother|father|mom|mum|dad|in-?laws?)\b/i, "parents"],
];

const KNOWN_CITIES = /\b(delhi|new delhi|mumbai|pune|bengaluru|bangalore|chennai|hyderabad|kolkata|ahmedabad|jaipur|lucknow|noida|gurgaon|gurugram|chandigarh|indore|bhopal|kochi|nagpur|patna|surat|thane|ghaziabad|faridabad)\b/i;

const DISEASES = /\b(diabetes|diabetic|sugar|blood pressure|bp|hypertension|thyroid|asthma|heart|cholesterol|kidney|cancer)\b/i;

function ageMentions(text: string): number[] {
  const explicit = [...text.matchAll(/(\d{1,3})\s*(?:years?|yrs?|year old|years old)|(?:i am|i'm|aged|age is|is)\s+(\d{1,3})\b/gi)];
  return explicit.map((match) => Number(match[1] ?? match[2])).filter((age) => age > 0 && age < 120);
}

interface PremiumRow {
  band: string;
  min: number;
  max: number;
  sumInsured: number;
  premium: number;
}

const PREMIUM_CHART: PremiumRow[] = readFileSync(`data/raw/${rules.premium_chart.path}`, "utf8")
  .trim()
  .split("\n")
  .slice(1)
  .map((row) => {
    const [band, sumInsured, premium] = row.split(",");
    const [min, max] = band.split("-").map(Number);
    return { band, min, max, sumInsured: Number(sumInsured.replace(/\D/g, "")), premium: Number(premium) };
  });

export function indicativePremium(age: number, sumInsuredLakh: number): PremiumRow | null {
  return PREMIUM_CHART.find((row) => age >= row.min && age <= row.max && row.sumInsured === sumInsuredLakh) ?? null;
}

const slotValue = (state: CallState, name: string) => state.slots[name]?.value;

function decide(state: CallState): Outcome {
  const sources: string[] = [];
  const age = slotValue(state, "eldest_member_age") as number | undefined;
  // Age rules first: a 70-year-old is not eligible whatever else is missing,
  // and telling them so beats a callback to collect fields that won't matter.
  if (age !== undefined && age > rules.entry_age.adult_max) {
    return {
      status: "not_eligible_refer_specialist",
      next_action: "specialist_callback_senior_plan",
      reasons: [`eldest member aged ${age} is above the Family Shield maximum entry age of ${rules.entry_age.adult_max}`],
      rule_sources: [rules.entry_age.source],
    };
  }
  if (age !== undefined && age < rules.entry_age.adult_min) {
    return {
      status: "not_eligible_underage",
      next_action: "advisor_callback",
      reasons: [`eldest member aged ${age} is below the minimum adult entry age of ${rules.entry_age.adult_min}`],
      rule_sources: [rules.entry_age.source],
    };
  }
  const missing = rules.required_fields.fields.filter((field) => slotValue(state, field) === undefined || slotValue(state, field) === null);
  if (missing.length) {
    return {
      status: "incomplete",
      next_action: "advisor_callback_to_complete",
      reasons: [`missing required fields: ${missing.join(", ")}`],
      rule_sources: [rules.required_fields.source],
    };
  }
  sources.push(rules.entry_age.source, rules.required_fields.source);
  if (slotValue(state, "pre_existing_disease") === true) {
    return {
      status: "needs_underwriting_review",
      next_action: "underwriter_callback",
      reasons: ["pre-existing condition declared; the bot does not accept or reject on medical grounds"],
      rule_sources: [...sources, "health/policies/qualification-rules.md#Rule Q3: Pre-existing conditions"],
    };
  }
  const members = (slotValue(state, "members_to_cover") as string[]) ?? [];
  const sumInsured = slotValue(state, "sum_insured") as number | undefined;
  const details: Record<string, unknown> = {
    // GAP-006: no list of serviceable cities was provided, so Rule Q4 can
    // only ever say "verify manually".
    city_verification: "manual_verification_required",
  };
  if (sumInsured && members.length === 1) {
    const row = indicativePremium(age!, sumInsured);
    if (row) details.indicative_premium = { age_band: row.band, sum_insured_lakh: row.sumInsured, annual_premium_inr: row.premium, basis: rules.premium_chart.basis };
  } else if (members.length > 1) {
    // GAP-004: the chart is per member; floater pricing is not in the material.
    details.indicative_premium = null;
    details.premium_note = "floater premium not in provided material; advisor sends written quote";
  }
  return {
    status: "qualified",
    next_action: "send_written_quote",
    reasons: ["all required fields captured", `eldest member aged ${age} within ${rules.entry_age.adult_min}-${rules.entry_age.adult_max}`, "no pre-existing condition declared"],
    rule_sources: [...sources, rules.premium_chart.source],
    details,
  };
}

function withinDeskHours(now: Date): boolean {
  // Desk hours are IST (UTC+05:30), Monday to Saturday, 09:00-20:00.
  const ist = new Date(now.getTime() + 330 * 60_000);
  const day = ist.getUTCDay();
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return day !== 0 && minutes >= 9 * 60 && minutes < 20 * 60;
}

export const healthPack: MarketPack = {
  market: "in_health",
  company: "Suraksha Health Insurance",
  registers: {
    en: { asr_locale: "en-IN", tts_locale: "en-IN", llm_instruction: "simple, polite Indian English" },
  },
  default_register: "en",
  detectRegister: () => "en",
  lines,
  slots: [
    {
      name: "members_to_cover",
      prompt: "ask_members",
      required: true,
      extract(text, asked) {
        // Only read when asked: "my wife has diabetes" later in the call is
        // about her health, not a change to who is covered.
        if (!asked) return undefined;
        const meaningful = MEMBER_WORDS.filter(([pattern]) => pattern.test(text)).map(([, member]) => member);
        if (!meaningful.length) return undefined;
        if (/\b(wife|husband|spouse|kids?|children|son|daughter|parents?|mother|father)\b/i.test(text) && /\b(and|also|with|plus|me|my)\b/i.test(text) && !meaningful.includes("self")) {
          meaningful.unshift("self");
        }
        return [...new Set(meaningful)];
      },
      describe: (value) => (value as string[]).join(", "),
    },
    {
      name: "eldest_member_age",
      prompt: "ask_age",
      required: true,
      extract(text, asked) {
        const explicit = ageMentions(text);
        if (explicit.length) return Math.max(...explicit);
        if (!asked || /lakh/i.test(text)) return undefined;
        const candidates = numbersIn(text).filter((value) => value > 0 && value < 120);
        return candidates.length ? Math.max(...candidates) : undefined;
      },
      describe: (value) => `${value} years`,
    },
    {
      name: "city",
      prompt: "ask_city",
      required: true,
      extract(text, asked) {
        const known = text.match(KNOWN_CITIES);
        if (known) return known[1].replace(/\b\w/g, (letter) => letter.toUpperCase());
        if (!asked) return undefined;
        const cleaned = text.replace(/\b(i live in|i'm in|i am in|we live in|living in|from|in|the city of|city|it's|it is|i stay in)\b/gi, "").trim();
        return cleaned && cleaned.split(/\s+/).length <= 3 ? cleaned.replace(/\b\w/g, (letter) => letter.toUpperCase()) : undefined;
      },
    },
    {
      name: "pre_existing_disease",
      prompt: "ask_ped",
      required: true,
      extract(text, asked) {
        if (/\b(no (medical )?(conditions?|problems?|issues?|disease)|nothing like that|all healthy|perfectly healthy)\b/i.test(text)) return false;
        if (DISEASES.test(text) && !/\bno\b/i.test(text)) return true;
        if (!asked) return undefined;
        const answer = yesNo(text);
        return answer === null ? undefined : answer === "yes";
      },
      describe: (value) => (value ? "yes, there is a condition" : "no condition"),
    },
    {
      name: "existing_cover",
      prompt: "ask_existing",
      required: true,
      extract(text, asked) {
        if (/\b(no|don'?t have|not have) (any )?(insurance|cover|policy)\b/i.test(text)) return false;
        if (/\b(office|employer|company|corporate|group) (insurance|cover|policy|mediclaim)\b|\bmediclaim\b/i.test(text)) return true;
        if (!asked) return undefined;
        const answer = yesNo(text);
        return answer === null ? undefined : answer === "yes";
      },
      describe: (value) => (value ? "you have existing cover" : "no existing cover"),
    },
    {
      name: "sum_insured",
      prompt: "ask_sum",
      required: false,
      extract(text, asked) {
        const lakh = text.match(/(\d{1,2})\s*lakh/i);
        const value = lakh ? Number(lakh[1]) : asked ? numbersIn(text).find((number) => rules.sum_insured_options_lakh.values.includes(number)) : undefined;
        return value !== undefined && rules.sum_insured_options_lakh.values.includes(value) ? value : undefined;
      },
      describe: (value) => `${value} lakh`,
    },
  ],
  objections: [
    { id: "price", pattern: /\b(too expensive|expensive|costly|can'?t afford|cannot afford|too much money|too high|premium is high)\b/i, query: "objection the premium is too expensive" },
    { id: "employer_cover", pattern: /\b(already have|i have) (health )?(insurance|cover|policy) (from|through|at) (my )?(office|employer|company|work)\b|\bmy (company|office|employer) (already )?(gives|provides|covers)\b/i, query: "objection I already have health cover from my employer" },
    { id: "claims_rejected", pattern: /\b(reject|rejected|never pay|don'?t pay|do not pay) (the )?claims?\b|\bclaims? (are|get) rejected\b|\bdon'?t trust\b/i, query: "objection insurance companies reject claims" },
    { id: "healthy", pattern: /\b(i'?m|i am) (young and )?(healthy|fit)\b|\bdon'?t need (insurance|it|this)\b/i, query: "objection I am healthy I do not need insurance" },
    {
      id: "call_later",
      pattern: /\b(think about it|call me later|call (me )?back later|call me next week|not now|busy right now|send me (the )?details)\b/i,
      query: "objection I need to think about it call me later",
      ends_with: { status: "callback_requested", next_action: "send_written_quote_and_callback", line: "callback_requested" },
    },
  ],
  patterns: {
    escalation: /\b(human|real person|actual person|someone real|representative|advisor|adviser|agent|manager|supervisor|speak to someone|talk to someone|complaint|complain about)\b/i,
    do_not_call: /\b(don'?t call (me )?again|do not call|stop calling|remove my number|not interested,? don'?t call)\b/i,
    dont_know: /\b(don'?t know|not sure|no idea|can'?t remember|don'?t remember|skip|rather not say|prefer not)\b/i,
    correction: /\b(actually|sorry,? i meant|i mean|correction|no wait|my mistake)\b/i,
  },
  max_unanswered_questions: rules.escalation.unanswered_questions_before_transfer,
  setup() {},
  vars(state) {
    const age = state.slots.eldest_member_age?.value;
    const premium = state.outcome?.details?.indicative_premium as { age_band: string; sum_insured_lakh: number; annual_premium_inr: number } | null | undefined;
    return {
      age: age === undefined ? "" : String(age),
      name_hint: "",
      // Rule Q7: no premium without the waiting-period disclosure first.
      disclosure: state.disclosures_given.includes("waiting_period") ? "" : `${lines.waiting_disclosure.en} `,
      premium_line: premium
        ? `The indicative annual premium for one member aged ${premium.age_band} with ${premium.sum_insured_lakh} lakh cover is Rs ${premium.annual_premium_inr.toLocaleString("en-IN")}. `
        : "",
    };
  },
  declined: { status: "callback_requested", next_action: "advisor_callback", line: "declined" },
  decide,
  outcomeLine(outcome) {
    if (outcome.status === "qualified") return "outcome_qualified";
    if (outcome.status === "needs_underwriting_review") return "outcome_review";
    if (outcome.status === "not_eligible_refer_specialist") return "outcome_senior";
    if (outcome.status === "not_eligible_underage") return "outcome_underage";
    return "outcome_incomplete";
  },
  escalationOutcome(state, reason) {
    const now = new Date(state.turns.at(-1)?.at ?? Date.now());
    const live = withinDeskHours(now);
    return {
      outcome: {
        status: "escalated_to_human",
        next_action: live ? "warm_transfer_senior_advisor" : "callback_next_working_day",
        reasons: [reason],
        rule_sources: [rules.escalation.source, "health/policies/sales-desk-notes.md#Escalation desk"],
      },
      line: live ? "escalate_now" : "escalate_callback",
    };
  },
};
