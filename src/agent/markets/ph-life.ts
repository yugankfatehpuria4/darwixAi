import accounts from "../../../config/mock-accounts.json" with { type: "json" };
import rules from "../../../config/ph-rules.json" with { type: "json" };
import { detectLanguage, tokenize } from "../../text";
import { philippineEnglishDate, pesos, tagalogDate, tagalogDaypart } from "../locale";
import type { MarketPack } from "../market";
import { resolvePromiseDate, toIsoDate } from "../parse";
import type { CallState, Outcome } from "../types";

const account = accounts.ph_life;

// Written for the market, not translated from the health bot: "po/opo"
// throughout, Sir/Ma'am + surname, English kept for the insurance terms
// Filipinos actually say in English (premium, policy, due, grace period,
// advisor), amounts said as "7,350 pesos". Needs native-speaker review (GAP-005).
const lines: MarketPack["lines"] = {
  greeting: {
    taglish: "Magandang {daypart_tl} po! Si Lia po ito, virtual assistant ng Kalinga Life, partner ng Bayanihan Bank. Para po sa quality at training purposes, naka-record po ang tawag na ito. Si {title} {last_name} po ba ang kausap ko?",
    en: "Good {daypart_en}! This is Lia, a virtual assistant from Kalinga Life, partner of Bayanihan Bank. This call is recorded for quality and training purposes. Am I speaking with {title} {last_name}?",
  },
  consent_repeat: {
    taglish: "Pasensya na po, si {title} {last_name} po ba ito? Oo o hindi lang po.",
    en: "Sorry, may I just confirm: am I speaking with {title} {last_name}?",
  },
  declined: {
    taglish: "Ay, pasensya na po sa abala. Tatawag na lang po ulit kami. Salamat po, ingat po kayo.",
    en: "I'm sorry for the trouble. We'll call back another time. Thank you.",
  },
  ask_last4: {
    taglish: "Salamat po, {title}. Para po sa security, pwede ko po bang makuha ang huling apat na digits ng policy number ninyo?",
    en: "Thank you, {title}. For security, may I have the last four digits of your policy number?",
  },
  verify_failed: {
    taglish: "Pasensya na po, hindi po tugma sa record namin. Pakisabi po ulit ang huling apat na digits?",
    en: "Sorry, that doesn't match our record. Could you say the last four digits again?",
  },
  reminder: {
    taglish: "Salamat po, verified na po kayo. Tumatawag po ako para ipaalala na ang {mode} premium ng {product} ninyo na {amount} ay due sa {due_date_tl}. Kung sakaling ma-late po, may 31 days po kayong grace period mula sa due date.",
    en: "Thank you, you're verified. I'm calling to remind you that your {mode} premium for {product}, {amount}, is due on {due_date_en}. If you need a little more time, there's a 31-day grace period from the due date.",
  },
  ask_payment_date: {
    taglish: "Kailan po kaya kayo makakapagbayad?",
    en: "When do you think you'll be able to pay?",
  },
  ask_channel: {
    taglish: "Saan po kayo magbabayad: sa Bayanihan Bank branch, sa mobile app, o sa e-wallet?",
    en: "And how will you pay: at a Bayanihan Bank branch, through the mobile app, or an e-wallet?",
  },
  unclear: { taglish: "Pasensya na po, hindi ko po masyadong narinig. Pakiulit po?", en: "Sorry, I didn't catch that. Could you say it again?" },
  unclear_answer: { taglish: "Pasensya na po, hindi ko po nakuha.", en: "Sorry, I didn't quite get that." },
  silence: { taglish: "Hello po, nandiyan pa po ba kayo?", en: "Hello, are you still there?" },
  silence_end: { taglish: "Mukhang naputol po ang linya. Tatawag na lang po ulit kami. Salamat po.", en: "It looks like we got disconnected. We'll call you back. Thank you." },
  fallback: {
    taglish: "Pasensya na po, wala po akong impormasyon tungkol diyan. Pwede ko po kayong i-connect sa isang advisor na makakasagot.",
    en: "I'm sorry, I don't have that information. I can connect you with an advisor who can answer that.",
  },
  conflict: {
    taglish: "Para lang po sigurado: kanina po ang sabi ninyo ay {previous}, ngayon po ay {incoming}. {incoming} po ba ang tama?",
    en: "Just to be sure: earlier you said {previous}, and now {incoming}. Is {incoming} correct?",
  },
  conflict_kept: { taglish: "Sige po, {value} po ang itatala ko.", en: "Okay, I'll note {value}." },
  noted_skip: { taglish: "Okay lang po, ipapaalam ko na lang po sa advisor.", en: "That's fine, I'll let the advisor know." },
  do_not_call: {
    taglish: "Naiintindihan ko po. Itatala ko po na ayaw na ninyong makatanggap ng ganitong tawag. Salamat po.",
    en: "Understood. I'll note that you don't want calls like this. Thank you.",
  },
  escalate_now: {
    taglish: "Sige po, ipapasa ko po kayo sa isang Kalinga Life advisor. Sandali lang po.",
    en: "Of course, I'm passing you to a Kalinga Life advisor. One moment please.",
  },
  cancel_transfer: { taglish: "Sandali lang po.", en: "One moment please." },
  outcome_before_due: {
    taglish: "Salamat po! Itatala ko po na magbabayad kayo sa {promise_date_tl}{channel_phrase_tl}, bago pa po ang due date. Ipapadala po ang official receipt sa email at SMS. Salamat po, ingat po kayo!",
    en: "Thank you! I'll note that you'll pay on {promise_date_en}{channel_phrase_en}, before the due date. The official receipt will be sent by email and SMS. Thank you, take care!",
  },
  outcome_within_grace: {
    taglish: "Salamat po! Itatala ko po na magbabayad kayo sa {promise_date_tl}{channel_phrase_tl}. Pasok pa po iyon sa grace period, kaya tuloy po ang coverage ninyo. Ipapadala po ang official receipt sa email at SMS. Salamat po, ingat po kayo!",
    en: "Thank you! I'll note that you'll pay on {promise_date_en}{channel_phrase_en}. That's still within the grace period, so your coverage continues. The official receipt will be sent by email and SMS. Thank you, take care!",
  },
  outcome_beyond_grace: {
    taglish: "Pasensya na po, ang {promise_date_tl} po ay lampas na sa 31-day grace period, kaya mag-la-lapse po ang policy bago ang petsang iyon. Kung nawalan po kayo ng trabaho, nagkasakit, o naapektuhan ng kalamidad, pwede po kayong mag-request ng premium payment extension bago matapos ang grace period. Ise-schedule ko po kayo ng callback sa isang advisor. Salamat po.",
    en: "I'm sorry, {promise_date_en} is past the 31-day grace period, so the policy would lapse before then. If you've lost your job, been ill, or been affected by a calamity, you can request a premium payment extension before the grace period ends. I'll schedule a callback with an advisor. Thank you.",
  },
  outcome_hardship: {
    taglish: "Naiintindihan ko po, at pasensya na po sa pinagdadaanan ninyo. Ise-schedule ko po kayo ng callback sa isang Kalinga Life advisor para sa premium payment extension, hanggang 60 days, isang beses kada policy year. Ang advisor po ang mag-a-approve, kaya hindi ko po ito maipapangako. Salamat po, ingat po kayo.",
    en: "I understand, and I'm sorry you're going through this. I'll schedule a callback with a Kalinga Life advisor about a premium payment extension of up to 60 days, once per policy year. The advisor makes the decision, so I can't promise it. Thank you, take care.",
  },
  outcome_incomplete: {
    taglish: "Okay lang po. Tatawag po ulit kami bago matapos ang grace period. Salamat po, ingat po kayo.",
    en: "That's fine. We'll call you again before the grace period ends. Thank you, take care.",
  },
};

export const HARDSHIP = /\b(nawalan (po )?(ako )?ng trabaho|natanggal (po )?(ako )?sa trabaho|lost my job|laid off|nagkasakit|may sakit|naospital|na-ospital|hospitali[sz]ed|kalamidad|bagyo|binaha|baha|calamity|typhoon|flood)\b/i;

const CHANNELS: Array<[RegExp, string, string, string]> = [
  [/\b(branch|sangay|over the counter|otc|sa bangko)\b/i, "branch", "sa Bayanihan Bank branch", "at a Bayanihan Bank branch"],
  [/\b(app|mobile app|online banking|online)\b/i, "mobile_app", "sa mobile app", "through the mobile app"],
  [/\b(e-?wallet|gcash|maya)\b/i, "e_wallet", "sa e-wallet", "through an e-wallet"],
];

function dueDate(state: CallState): string {
  return String(state.account!.due_date);
}

function graceEnd(state: CallState): string {
  const end = new Date(`${dueDate(state)}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + rules.grace_period_days.value);
  return toIsoDate(end);
}

function decide(state: CallState): Outcome {
  const promise = state.slots.payment_date?.value;
  const sources = [rules.grace_period_days.source];
  if (promise === "hardship") {
    return {
      status: "hardship_extension_callback",
      next_action: "advisor_callback_premium_extension",
      reasons: ["customer reported hardship (job loss, illness or calamity)"],
      rule_sources: [rules.hardship_extension_max_days.source],
      details: { due_date: dueDate(state), grace_end: graceEnd(state) },
    };
  }
  if (typeof promise !== "string") {
    return { status: "no_commitment", next_action: "follow_up_call_before_grace_end", reasons: ["no payment date given"], rule_sources: sources, details: { due_date: dueDate(state), grace_end: graceEnd(state) } };
  }
  const details = { due_date: dueDate(state), grace_end: graceEnd(state), promise_date: promise, channel: state.slots.payment_channel?.value ?? null };
  if (promise <= dueDate(state)) {
    return { status: "promise_before_due", next_action: "log_promise_to_pay", reasons: [`promise ${promise} on or before due ${dueDate(state)}`], rule_sources: sources, details };
  }
  if (promise <= graceEnd(state)) {
    return { status: "promise_within_grace", next_action: "log_promise_to_pay", reasons: [`promise ${promise} within grace period ending ${graceEnd(state)}`], rule_sources: sources, details };
  }
  return {
    status: "promise_beyond_grace",
    next_action: "advisor_callback_premium_extension",
    reasons: [`promise ${promise} is after grace period end ${graceEnd(state)}; policy would lapse first`],
    rule_sources: [...sources, rules.hardship_extension_max_days.source],
    details,
  };
}

export const phLifePack: MarketPack = {
  market: "ph_life",
  company: "Kalinga Life Assurance",
  registers: {
    // One recogniser for the whole call: fil-PH, which also has to carry the
    // English half of Taglish. Only the reply voice changes with register.
    taglish: { asr_locale: "fil-PH", tts_locale: "fil-PH", llm_instruction: "natural Filipino Taglish as a polite phone agent would speak it, using po/opo, keeping insurance terms like premium, policy, grace period in English" },
    en: { asr_locale: "fil-PH", tts_locale: "en-PH", llm_instruction: "polite Philippine English" },
  },
  default_register: "taglish",
  detectRegister(text, current) {
    // Short answers ("yes", "opo", "4821") carry no register signal.
    if (tokenize(text).length < 3) return /\b(opo|oo|po)\b/i.test(text) ? "taglish" : current;
    return detectLanguage(text).language === "en" ? "en" : "taglish";
  },
  lines,
  slots: [
    {
      name: "policy_last4",
      prompt: "ask_last4",
      required: true,
      extract(text, asked) {
        if (!asked) return undefined;
        const digits = text.replace(/[^\d]/g, "");
        return digits.length === 4 ? digits : undefined;
      },
      verify: (value, state) => value === state.account?.policy_last4,
    },
    {
      name: "payment_date",
      prompt: "ask_payment_date",
      required: true,
      extract(text, asked, state) {
        if (HARDSHIP.test(text)) return "hardship";
        if (!asked) return undefined;
        return resolvePromiseDate(text, new Date(`${state.today}T00:00:00Z`)) ?? undefined;
      },
      describe: (value, register) => (value === "hardship" ? "hardship" : register === "en" ? philippineEnglishDate(String(value)) : tagalogDate(String(value))),
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
      id: "no_money_yet",
      pattern: /\b(wala (pa )?(po )?(akong )?(pera|pambayad)|wala pang pera|sa sweldo|sweldo pa|pag sumweldo|payday|hindi pa (po )?ako makakabayad|not yet paid|no money yet)\b/i,
      unless: HARDSHIP,
      query: "Objection Wala pa po akong pera Sa sweldo pa po",
    },
    {
      id: "cancel_policy",
      pattern: /\b(i-?cancel|ipa-?cancel|cancel (ko|na|the|my)|ayoko na|ayaw ko na|hindi ko na kailangan|stop (the|my) policy)\b/i,
      query: "Objection Gusto ko na pong i-cancel Hindi ko na kailangan",
      ends_with: { status: "cancellation_request", next_action: "advisor_transfer_retention", line: "cancel_transfer" },
    },
  ],
  patterns: {
    escalation: /\b(tao|totoong tao|real person|human|advisor|agent|supervisor|manager|reklamo|complaint|claim)\b/i,
    do_not_call: /\b(huwag (na )?(po )?(n'?yo )?(akong )?tawagan|wag na (po )?(kayong )?tumawag|don'?t call (me )?again|stop calling)\b/i,
    dont_know: /\b(hindi ko (pa )?alam|di ko alam|ewan|not sure|don'?t know|bahala na)\b/i,
    correction: /\b(ay mali|mali pala|i mean|actually|sorry,? i meant|ibig kong sabihin)\b/i,
  },
  max_unanswered_questions: rules.max_unanswered_questions.value,
  address_terms: { "Ma'am/Sir": "title", "Sir/Ma'am": "title" },
  setup(state) {
    const due = new Date(`${state.today}T00:00:00Z`);
    due.setUTCDate(due.getUTCDate() + account.due_in_days);
    state.account = { ...account, due_date: toIsoDate(due) };
    state.known_pii = [
      { value: account.last_name, label: "CUSTOMER_NAME" },
      { value: account.first_name, label: "CUSTOMER_NAME" },
    ];
  },
  vars(state) {
    const daypart = tagalogDaypart(new Date(state.started_at));
    const promise = state.slots.payment_date?.value;
    const channel = CHANNELS.find(([, id]) => id === state.slots.payment_channel?.value);
    return {
      daypart_tl: daypart.tl,
      daypart_en: daypart.en,
      title: account.title,
      last_name: account.last_name,
      product: account.product,
      mode: account.mode,
      amount: pesos(account.premium_php),
      due_date_tl: tagalogDate(dueDate(state)),
      due_date_en: philippineEnglishDate(dueDate(state)),
      promise_date_tl: typeof promise === "string" && promise !== "hardship" ? tagalogDate(promise) : "",
      promise_date_en: typeof promise === "string" && promise !== "hardship" ? philippineEnglishDate(promise) : "",
      channel_phrase_tl: channel ? ` ${channel[2]}` : "",
      channel_phrase_en: channel ? ` ${channel[3]}` : "",
    };
  },
  afterSlot(slot, state) {
    if (slot === "policy_last4") return "reminder";
    // Nothing to ask about a payment channel when there is no payment.
    if (slot === "payment_date" && state.slots.payment_date?.value === "hardship") state.skipped.push("payment_channel");
    return null;
  },
  declined: { status: "wrong_person_no_disclosure", next_action: "retry_call_later", line: "declined" },
  decide,
  outcomeLine(outcome) {
    switch (outcome.status) {
      case "promise_before_due": return "outcome_before_due";
      case "promise_within_grace": return "outcome_within_grace";
      case "promise_beyond_grace": return "outcome_beyond_grace";
      case "hardship_extension_callback": return "outcome_hardship";
      default: return "outcome_incomplete";
    }
  },
  escalationOutcome(_state, reason) {
    return {
      // GAP-007: advisor desk hours for Kalinga Life are not in the material,
      // so the bot cannot say whether the transfer is live or a callback.
      outcome: { status: "escalated_to_human", next_action: "advisor_transfer_or_callback", reasons: [reason], rule_sources: ["ph/scripts/premium-reminder-script.md#Escalation"] },
      line: "escalate_now",
    };
  },
};
