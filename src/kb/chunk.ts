import { canonicalFieldName, normalizeHeading } from "./normalize";
import type { Block, ExtractedDocument } from "./types";

// Spoken answers are one to three sentences, so a chunk should be one
// self-contained answer unit. Sections in this corpus run 30-150 words;
// 180 words (~240 tokens) only forces a split on unusually long prose.
const MAX_WORDS = 180;

export interface DraftChunk {
  section: string;
  content: string;
  kind: Block["kind"];
}

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

function splitSentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [text];
}

/** Splits only when over the limit, at sentence boundaries, repeating one sentence for context. */
function splitLong(text: string): string[] {
  if (wordCount(text) <= MAX_WORDS) return [text];
  const pieces: string[] = [];
  let current: string[] = [];
  for (const sentence of splitSentences(text)) {
    if (current.length && wordCount([...current, sentence].join(" ")) > MAX_WORDS) {
      pieces.push(current.join(" "));
      current = [current[current.length - 1]];
    }
    current.push(sentence);
  }
  if (current.length) pieces.push(current.join(" "));
  return pieces;
}

function renderFormFields(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const [label, ...rest] = line.split(":");
      const canonical = canonicalFieldName(label);
      const value = rest.join(":").trim();
      const name = canonical ? `${label.trim()} [${canonical}]` : label.trim();
      return value && value !== "(blank)" ? `${name}: ${value}` : name;
    })
    .join("\n");
}

export function chunkDocument(document: ExtractedDocument): DraftChunk[] {
  const chunks: DraftChunk[] = [];
  let pending: { path: string[]; kind: Block["kind"]; texts: string[] } | null = null;

  const flush = () => {
    if (!pending) return;
    const section = pending.path.map(normalizeHeading).join(" > ");
    const body = pending.texts.join(pending.kind === "prose" ? "\n" : " ");
    if (pending.kind === "faq") {
      // The question heading belongs in the chunk: customers ask in the
      // question's words, not the answer's.
      chunks.push({ section, content: `Q: ${pending.path[pending.path.length - 1]}\nA: ${body}`, kind: "faq" });
    } else if (pending.kind === "form_fields") {
      chunks.push({ section, content: renderFormFields(body), kind: "form_fields" });
    } else {
      for (const piece of splitLong(body)) chunks.push({ section, content: piece, kind: pending.kind });
    }
    pending = null;
  };

  for (const block of document.blocks) {
    // Clauses and table groups are already semantic units; never merge them.
    const mergeable =
      pending &&
      pending.kind === block.kind &&
      block.kind !== "clause" &&
      block.kind !== "table_rows" &&
      pending.path.join("|") === block.heading_path.join("|");
    if (mergeable) {
      pending!.texts.push(block.text);
    } else {
      flush();
      pending = { path: block.heading_path, kind: block.kind, texts: [block.text] };
    }
  }
  flush();
  return chunks;
}
