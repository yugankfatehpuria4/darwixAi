import { readFile } from "node:fs/promises";
import * as cheerio from "cheerio";
import { extractText, getDocumentProxy } from "unpdf";
import { normalizeWhitespace } from "../text";
import { normalizeDate } from "./normalize";
import type { Block, ExtractedDocument, SourceEntry } from "./types";

export class ExtractionError extends Error {}

export async function extractDocument(source: SourceEntry, absolutePath: string): Promise<ExtractedDocument> {
  const extension = absolutePath.slice(absolutePath.lastIndexOf(".") + 1).toLowerCase();
  let extracted: Omit<ExtractedDocument, "source">;
  if (extension === "html") extracted = extractHtml(await readFile(absolutePath, "utf8"));
  else if (extension === "pdf") extracted = await extractPdf(await readFile(absolutePath));
  else if (extension === "md") extracted = extractMarkdown(await readFile(absolutePath, "utf8"));
  else if (extension === "csv") extracted = extractCsv(await readFile(absolutePath, "utf8"), source);
  else if (extension === "txt") extracted = extractForm(await readFile(absolutePath, "utf8"));
  else throw new ExtractionError(`No extractor for .${extension} (${source.path})`);

  const usableText = extracted.blocks.reduce((total, block) => total + block.text.length, 0);
  if (usableText < 40) {
    throw new ExtractionError(
      `Only ${usableText} characters of text extracted from ${source.path}; likely a scanned or image-only file that needs OCR`,
    );
  }
  return {
    ...extracted,
    source,
    title: source.title ?? extracted.title,
    effective_date: source.effective_date ?? extracted.effective_date,
  };
}

function readVersionLine(text: string): { version: string; effective_date: string | null } {
  const version = text.match(/\bVersi(?:on)?\s+(\d+(?:\.\d+)*)/i)?.[1] ?? "1.0";
  const dateMatch = text.match(/\b(?:Effective|Berlaku|Last reviewed)[:\s]+(\d{4}-\d{2}-\d{2}|\d{2}[/-]\d{2}[/-]\d{4})/i);
  return { version, effective_date: dateMatch ? normalizeDate(dateMatch[1]) : null };
}

function extractHtml(html: string): Omit<ExtractedDocument, "source"> {
  const $ = cheerio.load(html);
  const title = $("title").text().split("|")[0].trim();
  const effectiveDate = $('meta[name="effective-date"]').attr("content") ?? null;

  // Structural chrome is dropped by tag. Repeated content blocks such as the
  // "Talk to an advisor" CTA are not dropped here: they are found later by
  // counting how many pages of the same site contain them (see boilerplate.ts).
  $("script, style, nav, header, footer, .cookie-banner").remove();
  const root = $("main").length ? $("main") : $("body");

  const blocks: Block[] = [];
  const headings: string[] = [];
  root.find("h1, h2, h3, p, li").each((_, element) => {
    const node = $(element);
    const text = normalizeWhitespace(node.text());
    if (!text) return;
    const tag = element.tagName.toLowerCase();
    if (tag === "h1" || tag === "h2" || tag === "h3") {
      const level = Number(tag[1]);
      headings.length = level - 1;
      headings[level - 1] = text;
      return;
    }
    const insideFaq = node.closest(".faq").length > 0;
    blocks.push({ heading_path: headings.filter(Boolean), text, kind: insideFaq ? "faq" : "prose" });
  });

  return { title, version: "1.0", effective_date: effectiveDate, blocks };
}

async function extractPdf(bytes: Buffer): Promise<Omit<ExtractedDocument, "source">> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text: pages } = await extractText(pdf, { mergePages: false });
  const pageLines = pages.map((page) => page.split("\n").map((line) => line.trim()).filter(Boolean));
  const { version, effective_date } = readVersionLine(pages.join("\n"));

  // A line is running header/footer if, with digits masked, it shows up on
  // most pages. Masking digits catches "Page 3 of 5".
  const shape = (line: string) => line.replace(/\d+/g, "#").toLowerCase();
  const counts = new Map<string, number>();
  for (const lines of pageLines) {
    for (const key of new Set(lines.map(shape))) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const repeated = (line: string) => pageLines.length > 1 && (counts.get(shape(line)) ?? 0) >= pageLines.length * 0.6;

  const blocks: Block[] = [];
  let section = "";
  let clause = "";
  const flush = () => {
    if (clause) blocks.push({ heading_path: section ? [section] : [], text: normalizeWhitespace(clause), kind: "clause" });
    clause = "";
  };
  for (const line of pageLines.flat()) {
    if (repeated(line)) continue;
    if (/^\d+\.\s+\p{Lu}/u.test(line)) {
      flush();
      section = line;
    } else if (/^\d+\.\d+\s/.test(line)) {
      flush();
      clause = line;
    } else {
      // Wrapped continuation lines; a clause never spans a section heading.
      clause = clause ? `${clause} ${line}` : line;
    }
  }
  flush();
  return { title: "", version, effective_date, blocks };
}

function extractMarkdown(markdown: string): Omit<ExtractedDocument, "source"> {
  const withoutComments = markdown.replace(/<!--[\s\S]*?-->/g, "");
  const { version, effective_date } = readVersionLine(withoutComments);
  const blocks: Block[] = [];
  const headings: string[] = [];
  let title = "";
  for (const paragraph of withoutComments.split(/\n\s*\n/)) {
    const text = normalizeWhitespace(paragraph);
    if (!text) continue;
    const heading = text.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      if (level === 1) title = heading[2];
      headings.length = level - 1;
      headings[level - 1] = heading[2];
      continue;
    }
    if (/^(Version|Versi|Effective|Berlaku|Last reviewed)\b/i.test(text)) continue;
    const isQuestion = headings.length === 3 && /\?$/.test(headings[2]);
    blocks.push({ heading_path: headings.filter(Boolean), text, kind: isQuestion ? "faq" : "prose" });
  }
  return { title, version, effective_date, blocks };
}

function extractCsv(csv: string, source: SourceEntry): Omit<ExtractedDocument, "source"> {
  const [headerLine, ...rows] = csv.trim().split(/\r?\n/);
  const columns = headerLine.split(",").map((column) => column.trim());
  const groups = new Map<string, string[][]>();
  for (const row of rows) {
    const cells = row.split(",").map((cell) => cell.trim());
    if (cells.length !== columns.length) {
      throw new ExtractionError(`Row has ${cells.length} cells, header has ${columns.length} (${source.path}): ${row}`);
    }
    const group = groups.get(cells[0]) ?? [];
    group.push(cells);
    groups.set(cells[0], group);
  }

  // One block per value of the first column, written as sentences, so a
  // retrieved chunk is readable on its own and keeps its column meaning.
  const label = (column: string) => column.replace(/_/g, " ");
  const blocks: Block[] = [...groups.entries()].map(([key, groupRows]) => ({
    heading_path: [`${label(columns[0])} ${key}`],
    kind: "table_rows",
    text: groupRows
      .map((cells) => columns.map((column, index) => `${label(column)}: ${cells[index]}`).join("; "))
      .join(". "),
  }));
  return { title: source.title ?? "", version: "1.0", effective_date: null, blocks };
}

function extractForm(text: string): Omit<ExtractedDocument, "source"> {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const { version, effective_date } = readVersionLine(text);
  const fields: string[] = [];
  const freeText: string[] = [];
  for (const line of lines) {
    const isBannerLine = !line.includes(":") && line === line.toUpperCase();
    if (/^SYNTHETIC SAMPLE CONTENT/i.test(line) || /^Form ID:/i.test(line) || isBannerLine) continue;
    const field = line.match(/^([^:]{2,80}):\s*(.*)$/);
    if (field) fields.push(`${field[1].trim()}: ${field[2].replace(/_+/g, "").trim() || "(blank)"}`);
    else freeText.push(line);
  }
  const blocks: Block[] = [{ heading_path: ["Fields"], text: fields.join("\n"), kind: "form_fields" }];
  if (freeText.length) blocks.push({ heading_path: ["Declaration"], text: freeText.join(" "), kind: "prose" });
  return { title: "", version, effective_date, blocks };
}
