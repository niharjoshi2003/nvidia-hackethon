/**
 * Evaluation harness: human agreement, false misses, refusals, latency, and
 * the model ablation, over a frozen set of labelled transcripts.
 *
 * Runs the production path, not a copy of it: the browser orchestrator with
 * its citation gate, calling the real /api/grade handler in-process. A number
 * produced here is a number about the shipped product.
 *
 * Run:   npm run eval                 (all three configurations)
 *        npm run eval -- two-stage    (one configuration)
 * Needs: TOKEN_FACTORY_API_KEY, NEMOTRON_NANO, NEMOTRON_ULTRA in .env
 *
 * Fixtures live in eval/fixtures.json, one entry per spoken answer:
 *   { id, topicId, kind, transcript, labels: { a, b } }
 * where each label is the rubric line that person judged the primary miss,
 * copied exactly, or null for "nothing substantive missed". `a` and `b` are
 * two people labelling independently, before either sees the model output.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import handler from "../api/grade";
import { gradeSpokenAnswer } from "@/agent/gradeSpokenAnswer";
import { findTopic } from "@/data/topics";
import { normalize } from "@/lib/text";
import type { GradeOutcome } from "@/types";

interface Fixture {
  id: string;
  topicId: string;
  kind: "complete" | "omission" | "paraphrase" | "noisy";
  transcript: string;
  labels: { a: string | null; b: string | null };
}

type Config = "two-stage" | "nano-only" | "ultra-only";

const CONFIGS: Config[] = ["two-stage", "nano-only", "ultra-only"];

interface Row {
  id: string;
  kind: Fixture["kind"];
  status: GradeOutcome["status"];
  cited: string | null;
  agreesA: boolean;
  agreesB: boolean;
  falseMiss: boolean;
  ms: number;
  promptTokens: number;
  completionTokens: number;
  detail?: string;
}

// --- setup ------------------------------------------------------------------

const NANO = process.env.NEMOTRON_NANO;
const ULTRA = process.env.NEMOTRON_ULTRA;
const KEY = process.env.TOKEN_FACTORY_API_KEY;

if (!KEY || !NANO || !ULTRA) {
  console.error("Set TOKEN_FACTORY_API_KEY, NEMOTRON_NANO and NEMOTRON_ULTRA in .env first.");
  process.exit(1);
}

const fixturePath = existsSync("eval/fixtures.json")
  ? "eval/fixtures.json"
  : "eval/fixtures.example.json";
const fixtures = JSON.parse(readFileSync(fixturePath, "utf8")) as Fixture[];

if (fixturePath.endsWith("example.json")) {
  console.warn(
    "Using eval/fixtures.example.json. These are illustrations, not a result:\n" +
      "record real answers into eval/fixtures.json before reporting any number.\n",
  );
}

const requested = process.argv[2] as Config | undefined;
const configs = requested ? [requested] : CONFIGS;
if (requested && !CONFIGS.includes(requested)) {
  console.error(`Unknown configuration "${requested}". Use one of: ${CONFIGS.join(", ")}`);
  process.exit(1);
}

// --- run --------------------------------------------------------------------

/**
 * Single-model configurations run both stages on the same model, so they
 * differ from the two-stage pipeline only in which model does which job.
 */
function selectModels(config: Config): void {
  process.env.NEMOTRON_NANO = config === "ultra-only" ? ULTRA : NANO;
  process.env.NEMOTRON_ULTRA = config === "nano-only" ? NANO : ULTRA;
}

const inProcess: typeof fetch = async (_url, init) =>
  handler(new Request("http://eval.local/api/grade", init));

const sameLine = (label: string | null, cited: string | null) =>
  label === null ? cited === null : cited !== null && normalize(label) === normalize(cited);

async function runOne(fixture: Fixture): Promise<Row> {
  const topic = findTopic(fixture.topicId);
  if (!topic) throw new Error(`fixture ${fixture.id}: unknown topic ${fixture.topicId}`);

  const outcome = await gradeSpokenAnswer({
    topic,
    transcript: fixture.transcript,
    // A key on the request bypasses the shared demo rate limit.
    ownApiKey: KEY,
    fetchImpl: inProcess,
  });

  // A clean verdict is a claim that nothing was missed; anything else cites no line.
  const cited =
    outcome.status === "graded" ? outcome.miss.rubricLine : outcome.status === "clean" ? null : undefined;

  return {
    id: fixture.id,
    kind: fixture.kind,
    status: outcome.status,
    cited: cited ?? null,
    agreesA: cited !== undefined && sameLine(fixture.labels.a, cited),
    agreesB: cited !== undefined && sameLine(fixture.labels.b, cited),
    falseMiss: fixture.labels.a === null && outcome.status === "graded",
    ms: outcome.calls.reduce((sum, c) => sum + c.ms, 0),
    promptTokens: outcome.calls.reduce((sum, c) => sum + (c.promptTokens ?? 0), 0),
    completionTokens: outcome.calls.reduce((sum, c) => sum + (c.completionTokens ?? 0), 0),
    ...("detail" in outcome ? { detail: outcome.detail } : {}),
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

// --- report -----------------------------------------------------------------

const both = fixtures.filter((f) => f.labels.b !== undefined);
const humansAgree = both.filter((f) => sameLine(f.labels.a, f.labels.b)).length;
const complete = fixtures.filter((f) => f.labels.a === null).length;

console.log(`${fixtures.length} answers across ${new Set(fixtures.map((f) => f.topicId)).size} topics`);
console.log(`Inter-rater agreement (the ceiling): ${humansAgree} of ${both.length}\n`);

mkdirSync("eval/results", { recursive: true });
const summary: string[] = [
  "| Configuration | Agrees with A | Agrees with B | False misses | Declined | Failed | Median ms | Tokens in/out |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
];

for (const config of configs) {
  selectModels(config);
  const rows: Row[] = [];
  for (const fixture of fixtures) {
    const row = await runOne(fixture);
    rows.push(row);
    console.log(`  [${config}] ${row.id}: ${row.status}${row.detail ? ` (${row.detail})` : ""}`);
  }

  const count = (pred: (r: Row) => boolean) => rows.filter(pred).length;
  const tokensIn = rows.reduce((s, r) => s + r.promptTokens, 0);
  const tokensOut = rows.reduce((s, r) => s + r.completionTokens, 0);

  summary.push(
    `| ${config} | ${count((r) => r.agreesA)} of ${rows.length} | ${count((r) => r.agreesB)} of ${rows.length} ` +
      `| ${count((r) => r.falseMiss)} of ${complete} | ${count((r) => r.status === "rejected")} ` +
      `| ${count((r) => r.status === "failed")} | ${median(rows.map((r) => r.ms))} | ${tokensIn}/${tokensOut} |`,
  );

  writeFileSync(
    `eval/results/${config}.json`,
    JSON.stringify({ config, fixturePath, models: { nano: NANO, ultra: ULTRA }, rows }, null, 2),
  );
}

selectModels("two-stage");
console.log(`\n${summary.join("\n")}\n`);
console.log("Per-answer detail is in eval/results/. Report counts, not percentages.");
