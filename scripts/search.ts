import { search } from "../src/kb/search";
import type { Market } from "../src/kb/types";

// Small CLI over the same search() the voice agent calls:
//   npm run search -- "is cosmetic surgery covered" --market in_health
const args = process.argv.slice(2);
const marketFlag = args.indexOf("--market");
const market = (marketFlag >= 0 ? args[marketFlag + 1] : "in_health") as Market;
const query = args.filter((_, index) => index !== marketFlag && index !== marketFlag + 1).join(" ");

if (!query) {
  console.error('usage: npm run search -- "<question>" [--market in_health|ph_life|id_finance]');
  process.exit(1);
}

const result = search(query, { market, topK: 3 });
console.log(`query:      ${result.query}`);
console.log(`expanded:   ${result.expanded_query}`);
console.log(`answerable: ${result.answerable} (${result.reason}, confidence ${result.confidence.toFixed(3)})`);
for (const hit of result.hits) {
  console.log(`\n#${hit.rank}  cosine=${hit.cosine} bm25=${hit.bm25} fused=${hit.fused_score}`);
  console.log(`    ${hit.citation}`);
  console.log(`    ${hit.record.content.replace(/\s+/g, " ").slice(0, 240)}`);
}
