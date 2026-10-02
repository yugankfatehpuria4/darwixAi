import { mkdir, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";
import { warmIndex } from "../src/kb/search";
import { buildServer } from "../src/server";

// Screen-records live.html while two Q4 calls are replayed at real-time
// speed, so the video shows nudges arriving during the call. Headless
// Chromium records video only (no audio track).
const executablePath = process.env.CHROME_PATH || "/opt/google/chrome/chrome";
const calls = process.argv.slice(2).length ? process.argv.slice(2) : ["q4-health-agent-slips", "q4-id-collector-pressure"];
const outDir = path.resolve("evidence/q4");
const videoDir = path.join(outDir, "video-tmp");

warmIndex();
const app = await buildServer();
await app.listen({ port: 0, host: "127.0.0.1" });
const address = app.server.address();
const base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;

await mkdir(videoDir, { recursive: true });
const browser = await chromium.launch({ executablePath, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, recordVideo: { dir: videoDir, size: { width: 1280, height: 860 } } });
const page = await context.newPage();
await page.goto(`${base}/live.html`);
await page.waitForSelector("#recording option", { state: "attached" });

for (const call of calls) {
  await page.selectOption("#recording", call);
  await page.selectOption("#speed", "1");
  await page.click("#play");
  // The status still says "Done" from the previous call until "started" arrives.
  await page.waitForFunction((name) => document.getElementById("status")!.textContent!.includes(name), call, { timeout: 30_000 });
  await page.waitForFunction(() => document.getElementById("status")!.textContent!.startsWith("Done"), null, { timeout: 300_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(outDir, `live_${call}.png`), fullPage: true });
  console.log(`${call}: ${await page.textContent("#status")}`);
}

await context.close();
await browser.close();
await app.close();
const [video] = await readdir(videoDir);
await rename(path.join(videoDir, video), path.join(outDir, "live_demo.webm"));
await rm(videoDir, { recursive: true });
console.log("saved evidence/q4/live_demo.webm");
