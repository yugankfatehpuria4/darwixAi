export type Market = "in_health" | "ph_life" | "id_finance";

export type DocType =
  | "product"
  | "policy"
  | "faq"
  | "script"
  | "claims"
  | "pricing"
  | "form"
  | "form_submission"
  | "operations";

// Higher number wins when two sources disagree or duplicate each other.
export const AUTHORITY_RANK = {
  policy_document: 4,
  internal_policy: 3,
  website: 2,
  marketing: 1,
} as const;

export type Authority = keyof typeof AUTHORITY_RANK;

export interface SourceEntry {
  path: string;
  source_url: string;
  market: Market;
  doc_type: DocType;
  authority: Authority;
  access: "public" | "internal" | "restricted";
  title?: string;
  effective_date?: string;
  /**
   * "customer": facts the bot may say to a caller. "agent": instructions for
   * the agent (scripts, underwriting rules, desk notes). Defaults from access.
   */
  audience?: "customer" | "agent";
  /** Retired document. Still ingested (so conflicts with it are reported) but never retrieved. */
  superseded_by?: string;
}

export type BlockKind = "prose" | "faq" | "clause" | "table_rows" | "form_fields";

export interface Block {
  heading_path: string[];
  text: string;
  kind: BlockKind;
}

export interface ExtractedDocument {
  source: SourceEntry;
  title: string;
  version: string;
  effective_date: string | null;
  blocks: Block[];
}

export type Category =
  | "product"
  | "eligibility"
  | "coverage"
  | "waiting_period"
  | "exclusions"
  | "pricing"
  | "payment"
  | "claims"
  | "faq"
  | "objection"
  | "compliance"
  | "escalation"
  | "form"
  | "operations"
  | "collection"
  | "cross_sell"
  | "script";

export interface PiiFinding {
  type: string;
  action: "masked" | "removed";
}

export interface KbRecord {
  record_id: string;
  title: string;
  section: string;
  content: string;
  search_text: string;
  category: Category;
  doc_type: DocType;
  market: Market;
  language: string;
  source: string;
  source_url: string;
  version: string;
  effective_date: string | null;
  authority: Authority;
  access: SourceEntry["access"];
  audience: "customer" | "agent";
  pii: boolean;
  pii_findings: PiiFinding[];
  content_hash: string;
  metadata: Record<string, string | number | boolean>;
}
