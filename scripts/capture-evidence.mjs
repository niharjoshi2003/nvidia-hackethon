/**
 * Saves the production-RAG evidence page.
 *
 * Requires `npm run dev` and `playwright` (uses the installed Edge, so Chromium
 * does not need a separate download):
 *
 *   npx --yes playwright install-deps   # not required on Windows with Edge
 *   npm run evidence:capture
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const url = process.env.EVIDENCE_URL ?? "http://localhost:5173/evidence/rag-production-sample";
const root = path.resolve("evidences/rag-production-sample");
const shots = path.join(root, "screenshots");

const tabs = [
  ["02-nano-vs-ultra.png", "Nano vs Ultra"],
  ["03-point-by-point.png", "Point by point"],
  ["04-key-ideas.png", "Key ideas"],
  ["05-skills.png", "Skills"],
  ["06-how-it-ran.png", "How it ran"],
];

await mkdir(shots, { recursive: true });

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Hide" }).click();
await page.getByText("Developing (split decision)").waitFor();

await page.screenshot({
  path: path.join(shots, "01-question-and-verdict.png"),
  fullPage: true,
});

for (const [file, label] of tabs) {
  await page.getByRole("tab", { name: label }).click();
  await page.getByRole("tab", { name: label, selected: true }).waitFor();
  await page.screenshot({ path: path.join(shots, file), fullPage: true });
}

await page.getByRole("tab", { name: "Verdict" }).click();
await page.pdf({
  path: path.join(root, "rag-production-sample.pdf"),
  format: "A4",
  printBackground: true,
});

await browser.close();
console.log(`Saved screenshots and PDF under ${root}`);
