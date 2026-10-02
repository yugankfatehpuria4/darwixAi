import { AUTHORITY_RANK, type KbRecord } from "./types";

/**
 * Facts that must agree across sources. Each pattern runs over search_text
 * (after "36 months" has been annotated as "3 years"), so the website and
 * the policy wordings are compared in the same unit.
 */
const FACT_PATTERNS: Array<{ fact: string; market: KbRecord["market"]; pattern: RegExp }> = [
  { fact: "pre-existing disease waiting period (years)", market: "in_health", pattern: /pre-existing disease[^.]*?(\d+) years/ },
  { fact: "annual grace period (days)", market: "in_health", pattern: /grace period of (\d+) days[^.]*annual/ },
  { fact: "free-look period (days)", market: "in_health", pattern: /free[- ]look period of (\d+) days/ },
  { fact: "adult maximum entry age (years)", market: "in_health", pattern: /maximum entry age is (\d+)/ },
  { fact: "grace period (days)", market: "ph_life", pattern: /(\d+)[- ]days? grace period|grace period of (\d+) days/ },
  { fact: "late fee (% per day)", market: "id_finance", pattern: /denda[^.]*?(\d+,\d+)% per hari/ },
];

export interface FactConflict {
  fact: string;
  values: Array<{ value: string; record_id: string; source: string; authority: string; effective_date: string | null }>;
  resolved_value: string;
  superseded_record_ids: string[];
}

export function findConflicts(records: KbRecord[]): FactConflict[] {
  const conflicts: FactConflict[] = [];
  for (const { fact, market, pattern } of FACT_PATTERNS) {
    const observed = records.flatMap((record) => {
      if (record.market !== market) return [];
      const match = record.search_text.match(pattern);
      const value = match?.slice(1).find(Boolean);
      return value
        ? [{ value, record_id: record.record_id, source: record.source, authority: record.authority, effective_date: record.effective_date }]
        : [];
    });
    if (new Set(observed.map((entry) => entry.value)).size < 2) continue;

    // The most authoritative, then most recent, source sets the value; the
    // records that disagree with it are superseded and kept out of retrieval.
    const winner = [...observed].sort(
      (a, b) =>
        AUTHORITY_RANK[b.authority as keyof typeof AUTHORITY_RANK] - AUTHORITY_RANK[a.authority as keyof typeof AUTHORITY_RANK] ||
        (b.effective_date ?? "").localeCompare(a.effective_date ?? ""),
    )[0];
    conflicts.push({
      fact,
      values: observed,
      resolved_value: winner.value,
      superseded_record_ids: observed.filter((entry) => entry.value !== winner.value).map((entry) => entry.record_id),
    });
  }
  return conflicts;
}
