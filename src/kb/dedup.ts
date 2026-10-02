import { createHash } from "node:crypto";
import { AUTHORITY_RANK, type ExtractedDocument, type KbRecord } from "./types";

export const NEAR_DUPLICATE_JACCARD = 0.85;
// A chunk whose trigrams sit almost entirely inside a longer chunk (an FAQ
// answer pasted from a product page that has one extra paragraph) adds
// nothing to retrieval; Jaccard alone misses it because the sizes differ.
export const CONTAINMENT_THRESHOLD = 0.9;

const normalizeForHash = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export const contentHash = (text: string) => createHash("sha256").update(normalizeForHash(text)).digest("hex");

export interface DroppedItem {
  source: string;
  reason: string;
  detail: string;
}

/** Mirrors of the same page (e.g. /faq and /help/faq) collapse to one document. */
export function dropDuplicateDocuments(documents: ExtractedDocument[]): { kept: ExtractedDocument[]; dropped: DroppedItem[] } {
  const seen = new Map<string, ExtractedDocument>();
  const dropped: DroppedItem[] = [];
  for (const document of documents) {
    const hash = contentHash(document.blocks.map((block) => block.text).join("\n"));
    const existing = seen.get(hash);
    if (existing) {
      dropped.push({ source: document.source.path, reason: "duplicate_document", detail: `identical extracted text to ${existing.source.path}` });
      continue;
    }
    seen.set(hash, document);
  }
  return { kept: [...seen.values()], dropped };
}

/**
 * A block that appears on most pages of the same site is site furniture
 * (call-to-action boxes, disclaimers), not knowledge. Requires 3+ pages and
 * at least half the site so two pages legitimately sharing a paragraph
 * survive.
 */
export function dropBoilerplateBlocks(documents: ExtractedDocument[]): DroppedItem[] {
  const dropped: DroppedItem[] = [];
  const byMarket = Map.groupBy(documents.filter((document) => document.source.path.endsWith(".html")), (document) => document.source.market);
  for (const pages of byMarket.values()) {
    const pageCount = new Map<string, number>();
    for (const page of pages) {
      for (const key of new Set(page.blocks.map((block) => normalizeForHash(block.text)))) {
        pageCount.set(key, (pageCount.get(key) ?? 0) + 1);
      }
    }
    const isBoilerplate = (text: string) => {
      const count = pageCount.get(normalizeForHash(text)) ?? 0;
      return count >= 3 && count >= pages.length / 2;
    };
    for (const page of pages) {
      const before = page.blocks.length;
      const removed = page.blocks.filter((block) => isBoilerplate(block.text));
      page.blocks = page.blocks.filter((block) => !isBoilerplate(block.text));
      if (before !== page.blocks.length) {
        dropped.push({
          source: page.source.path,
          reason: "boilerplate_block",
          detail: `${removed.length} repeated block(s): ${removed.map((block) => `"${block.text.slice(0, 50)}"`).join(", ")}`,
        });
      }
    }
  }
  return dropped;
}

function shingles(text: string): Set<string> {
  const words = normalizeForHash(text.replace(/^Q:.*\nA:\s*/, "")).split(" ");
  const grams = new Set<string>();
  for (let index = 0; index + 3 <= words.length; index++) grams.add(words.slice(index, index + 3).join(" "));
  return grams;
}

function overlap(a: Set<string>, b: Set<string>): { jaccard: number; containment: number } {
  if (!a.size || !b.size) return { jaccard: 0, containment: 0 };
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared++;
  return { jaccard: shared / (a.size + b.size - shared), containment: shared / Math.min(a.size, b.size) };
}

/** Which record survives a duplicate pair: stronger source, then newer, then more text. */
function preferred(a: KbRecord, b: KbRecord): KbRecord {
  const rank = AUTHORITY_RANK[a.authority] - AUTHORITY_RANK[b.authority];
  if (rank !== 0) return rank > 0 ? a : b;
  const dateA = a.effective_date ?? "";
  const dateB = b.effective_date ?? "";
  if (dateA !== dateB) return dateA > dateB ? a : b;
  return a.content.length >= b.content.length ? a : b;
}

/**
 * Exact duplicates by hash, near duplicates by word-trigram Jaccard. O(n^2)
 * is fine for a few hundred chunks; past ~10k chunks this becomes MinHash/LSH.
 */
export function dropDuplicateChunks(records: KbRecord[]): { kept: KbRecord[]; dropped: DroppedItem[] } {
  const dropped: DroppedItem[] = [];
  const removed = new Set<string>();
  const signatures = records.map((record) => shingles(record.content));
  for (let i = 0; i < records.length; i++) {
    if (removed.has(records[i].record_id)) continue;
    for (let j = i + 1; j < records.length; j++) {
      if (removed.has(records[j].record_id) || records[i].market !== records[j].market) continue;
      const exact = records[i].content_hash === records[j].content_hash;
      const { jaccard, containment } = exact ? { jaccard: 1, containment: 1 } : overlap(signatures[i], signatures[j]);
      const contained = jaccard < NEAR_DUPLICATE_JACCARD && containment >= CONTAINMENT_THRESHOLD;
      if (jaccard < NEAR_DUPLICATE_JACCARD && !contained) continue;
      const winner = contained
        ? (signatures[i].size >= signatures[j].size ? records[i] : records[j])
        : preferred(records[i], records[j]);
      const loser = winner === records[i] ? records[j] : records[i];
      removed.add(loser.record_id);
      dropped.push({
        source: `${loser.source} :: ${loser.section}`,
        reason: exact ? "exact_duplicate_chunk" : contained ? "contained_in_other_chunk" : "near_duplicate_chunk",
        detail: `jaccard=${jaccard.toFixed(2)} containment=${containment.toFixed(2)}, kept ${winner.record_id} (${winner.source} :: ${winner.section})`,
      });
      if (loser === records[i]) break;
    }
  }
  return { kept: records.filter((record) => !removed.has(record.record_id)), dropped };
}
