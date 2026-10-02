import type { Category, DocType } from "./types";

// Ordered: the first matching rule wins. Tried against the section heading
// first and only then against the document title, so a script titled "Lead
// Qualification Script" does not make every section "eligibility".
const RULES: Array<[RegExp, Category]> = [
  [/objection|keberatan/i, "objection"],
  [/disclosure|recording|rekaman|identity check|verifikasi|prohibited|etika|do not call/i, "compliance"],
  [/escalation|eskalasi/i, "escalation"],
  [/waiting period/i, "waiting_period"],
  [/exclusion/i, "exclusions"],
  [/no-claim|restoration|co-payment/i, "coverage"],
  [/claim/i, "claims"],
  [/entry age|who can buy|syarat|qualification|children|parents cover|pre-existing condition|serviceable|required fields/i, "eligibility"],
  [/payment|pembayaran|grace|lapse|reinstatement|jatuh tempo|denda|pelunasan|hardship|keringanan|reminder|pengingat/i, "payment"],
  [/multiguna|top-up|add-on|discount|rider|bank referral/i, "cross_sell"],
  [/cover|coverage|benefit|renewal|free look|cancellation|tax|beneficiar/i, "coverage"],
];

const DOC_TYPE_DEFAULT: Record<DocType, Category> = {
  product: "product",
  policy: "coverage",
  faq: "faq",
  script: "script",
  claims: "claims",
  pricing: "pricing",
  form: "form",
  form_submission: "form",
  operations: "operations",
};

const firstMatch = (label: string) => RULES.find(([pattern]) => pattern.test(label))?.[1];

export function categorize(docType: DocType, title: string, section: string): Category {
  // These document types are one category whatever their headings say.
  if (docType === "faq" || docType === "pricing" || docType === "form" || docType === "operations") {
    return DOC_TYPE_DEFAULT[docType];
  }
  // Markdown and HTML sections start with the document's H1, which is the
  // title again; only the headings below it describe this chunk.
  const headings = section.split(" > ").filter((heading) => heading !== title);
  const fromSection = headings.length ? firstMatch(headings[headings.length - 1]) ?? firstMatch(headings.join(" > ")) : undefined;
  if (fromSection) return fromSection;
  // A product page's title names the product ("Super Top-Up"), which is a
  // good category signal. A script's or policy's title is not: "Opening" in
  // "Lead Qualification Script" is not an eligibility rule.
  const titleIsTopical = docType === "product" || docType === "claims";
  return (titleIsTopical ? firstMatch(title) : undefined) ?? DOC_TYPE_DEFAULT[docType];
}
