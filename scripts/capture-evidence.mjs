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

// The proof panel has three tabs. Key ideas and skill levels now live inside
// "Model comparison", so they no longer get their own screenshots.
const tabs = [
  ["02-nano-vs-ultra.png", "Model comparison"],
  ["03-point-by-point.png", "Point by point"],
  ["06-how-it-ran.png", "How Nemotron graded this"],
];

await mkdir(shots, { recursive: true });

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Hide" }).click();
await page.getByText("Say this next time").waitFor();

await page.screenshot({
  path: path.join(shots, "01-question-and-verdict.png"),
  fullPage: true,
});

for (const [file, label] of tabs) {
  await page.getByRole("tab", { name: label }).click();
  await page.getByRole("tab", { name: label, selected: true }).waitFor();
  await page.screenshot({ path: path.join(shots, file), fullPage: true });
}

await page.getByRole("tab", { name: "Model comparison" }).click();
await page.pdf({
  path: path.join(root, "rag-production-sample.pdf"),
  format: "A4",
  printBackground: true,
});

await browser.close();
console.log(`Saved screenshots and PDF under ${root}`);
