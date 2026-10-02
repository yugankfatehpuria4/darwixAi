import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { buildServer } from "../src/server";

// Drives the real web calling page in headless Chromium with typed turns
// (no microphone in CI/sandbox) and saves screenshots as evidence.
//   CHROME_PATH=/path/to/chrome npm run ui:smoke
const executablePath = process.env.CHROME_PATH || "/opt/google/chrome/chrome";
const app = await buildServer();
await app.listen({ port: 0, host: "127.0.0.1" });
const address = app.server.address();
const base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 3000}`;

const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const failures: string[] = [];
page.on("pageerror", (error) => failures.push(`page error: ${error.message}`));

async function say(text: string) {
  const before = await page.locator(".turn.bot").count();
  await page.fill("#typedText", text);
  await page.click("#typed button[type=submit]");
  await page.waitForFunction((count) => document.querySelectorAll(".turn.bot").length > count, before, { timeout: 30_000 });
}

await mkdir("evidence/q1", { recursive: true });
await page.goto(`${base}/call.html?typed`);
await page.selectOption("#market", "in_health");
await page.click("#start");
await page.waitForSelector(".turn.bot");
for (const text of ["Yes, sure", "Just me", "I am 29", "Is cosmetic surgery covered?", "Bengaluru", "No", "No", "10 lakh"]) await say(text);
await page.waitForFunction(() => document.getElementById("outcome")!.textContent!.includes("qualification_status"), null, { timeout: 30_000 });
await page.screenshot({ path: "evidence/q1/web_call_ui.png", fullPage: true });

const botTurns = await page.locator(".turn.bot").allTextContents();
if (!botTurns.some((text) => text.includes("kb_in_health_exclusions"))) failures.push("cosmetic-surgery answer did not show its KB chunk id");
if (!botTurns.at(-1)?.includes("Rs 9,600")) failures.push("final turn did not include the indicative premium");

await page.goto(`${base}/call.html?typed`);
await page.selectOption("#market", "id_finance");
await page.click("#start");
await page.waitForSelector(".turn.bot");
for (const text of ["Iya bener, saya sendiri", "12 Maret 1990", "Kalau telat dendanya berapa sih?", "Belum gajian nih, gajiannya tanggal 10", "Lewat Alfamart aja"]) await say(text);
await page.screenshot({ path: "evidence/q3/web_call_id_ui.png", fullPage: true });

await page.goto(`${base}/dashboard.html`);
await page.fill("#query", "is cosmetic surgery covered");
await page.click("#searchForm button");
await page.waitForSelector("#searchResult table");
await page.locator("#calls tr").first().click();
await page.waitForSelector("#detail .transcript");
await page.screenshot({ path: "evidence/q1/dashboard_ui.png", fullPage: true });

await browser.close();
await app.close();
console.log(failures.length ? `FAIL\n${failures.join("\n")}` : "PASS: web call (in_health, id_finance) and dashboard rendered; screenshots in evidence/");
process.exitCode = failures.length ? 1 : 0;
