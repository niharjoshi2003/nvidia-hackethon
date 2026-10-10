/**
 * Coach evaluation: Nano alone, Ultra alone, and the parallel combination,
 * each measured against human per-line labels. Never against each other.
 *
 * Runs the production path: gradeParallel with its gate and combine step,
 * calling the real /api/grade handler in-process. One request per answer
 * yields both models' verdicts, so the three configurations cost one run.
 *
 * Run:   npm run eval:coach
 * Needs: TOKEN_FACTORY_API_KEY, NEMOTRON_NANO, NEMOTRON_ULTRA in .env
 *
 * Fixtures: eval/coach-fixtures.json (falls back to the example file):
 *   { id, topicId, kind, source, transcript, labels: { a: {line: status}, b: {...} } }
 * Every key point of the topic must be labelled by both people, independently,
 * before either sees model output. Natural spoken answers, not rubric lines
 * read back.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import handler from "../api/grade";
import { gradeParallel } from "@/agent/gradeParallel";
import { findTopic } from "@/data/topics";
import {
  emptyCounts,
  fromCombined,
  fromVerdicts,
  interRater,
  scoreAnswer,
  type AgreementCounts,
  type HumanLabels,
} from "@/lib/agreement";
import type { CombinedLine, LineVerdict } from "@/types";

interface CoachFixture {
  id: string;
  topicId: string;
  kind: string;
  source?: string;
  transcript: string;
  labels: { a: HumanLabels; b?: HumanLabels };
}

const KEY = process.env.TOKEN_FACTORY_API_KEY;
if (!KEY || !process.env.NEMOTRON_NANO || !process.env.NEMOTRON_ULTRA) {
  console.error("Set TOKEN_FACTORY_API_KEY, NEMOTRON_NANO and NEMOTRON_ULTRA in .env first.");
  process.exit(1);
}

const fixturePath = existsSync("eval/coach-fixtures.json")
  ? "eval/coach-fixtures.json"
  : "eval/coach-fixtures.example.json";
const fixtures = JSON.parse(readFileSync(fixturePath, "utf8")) as CoachFixture[];
const isExample = fixturePath.endsWith("example.json");
if (isExample) {
  console.warn(
    "Using eval/coach-fixtures.example.json. That is a format illustration, not a result;\n" +
      "the summary will be written with measured: false.\n",
  );
}

// Every fixture must label every key point, or agreement silently shrinks.
for (const f of fixtures) {
  const topic = findTopic(f.topicId);
  if (!topic) throw new Error(`${f.id}: unknown topic ${f.topicId}`);
  for (const [who, labels] of Object.entries(f.labels)) {
    if (!labels) continue;
    const missing = topic.scaffold.keyPoints.filter((line) => !(line in labels));
    const extra = Object.keys(labels).filter((line) => !topic.scaffold.keyPoints.includes(line));
    if (missing.length || extra.length) {
      throw new Error(`${f.id} labels.${who}: ${missing.length} unlabelled, ${extra.length} not key points`);
    }
  }
}

const inProcess: typeof fetch = async (_url, init) =>
  handler(new Request("http://eval.local/api/grade", init));

interface Row {
  id: string;
  kind: string;
  status: string;
  nano: LineVerdict[] | null;
  ultra: LineVerdict[] | null;
  combined: CombinedLine[] | null;
  headline: string | null;
  ms: { nano: number; ultra: number };
  tokens: { in: number; out: number };
  detail?: string;
}

const rows: Row[] = [];
const counts: Record<"nano" | "ultra" | "combined", AgreementCounts> = {
  nano: emptyCounts(),
  ultra: emptyCounts(),
  combined: emptyCounts(),
};

for (const fixture of fixtures) {
  const topic = findTopic(fixture.topicId)!;
  const outcome = await gradeParallel({
    topic,
    transcript: fixture.transcript,
    ownApiKey: KEY,
    fetchImpl: inProcess,
  });

  const calls = outcome.calls;
  const msFor = (purpose: string) =>
    calls.filter((c) => c.purpose === purpose).reduce((s, c) => s + c.ms, 0);

  if (outcome.status !== "graded") {
    rows.push({
      id: fixture.id,
      kind: fixture.kind,
      status: outcome.status,
      nano: null,
      ultra: null,
      combined: null,
      headline: null,
      ms: { nano: msFor("lines-nano"), ultra: msFor("lines-ultra") },
      tokens: { in: 0, out: 0 },
      ...("detail" in outcome ? { detail: outcome.detail } : {}),
    });
    console.log(`  ${fixture.id}: ${outcome.status}`);
    continue;
  }

  const nano = outcome.lines.every((l) => l.nano) ? outcome.lines.map((l) => l.nano!) : null;
  const ultra = outcome.lines.every((l) => l.ultra) ? outcome.lines.map((l) => l.ultra!) : null;

  // A failed model scores as abstaining on every line, not as absent.
  counts.nano = scoreAnswer(counts.nano, fixture.labels.a, fromVerdicts(nano));
  counts.ultra = scoreAnswer(counts.ultra, fixture.labels.a, fromVerdicts(ultra));
  counts.combined = scoreAnswer(counts.combined, fixture.labels.a, fromCombined(outcome.lines));

  rows.push({
    id: fixture.id,
    kind: fixture.kind,
    status: outcome.partial ? "partial" : "graded",
    nano,
    ultra,
    combined: outcome.lines,
    headline: outcome.headline?.rubricLine ?? null,
    ms: { nano: msFor("lines-nano"), ultra: msFor("lines-ultra") },
    tokens: {
      in: calls.reduce((s, c) => s + (c.promptTokens ?? 0), 0),
      out: calls.reduce((s, c) => s + (c.completionTokens ?? 0), 0),
    },
  });
  console.log(`  ${fixture.id}: ${outcome.partial ? "partial" : "graded"}`);
}

const pairs = fixtures
  .filter((f): f is CoachFixture & { labels: { a: HumanLabels; b: HumanLabels } } => !!f.labels.b)
  .map((f) => ({ a: f.labels.a, b: f.labels.b }));
const humans = pairs.length ? interRater(pairs) : null;

const median = (values: number[]) => {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
};

mkdirSync("eval/results", { recursive: true });
writeFileSync(
  "eval/results/coach-rows.json",
  JSON.stringify({ fixturePath, models: { nano: process.env.NEMOTRON_NANO, ultra: process.env.NEMOTRON_ULTRA }, rows }, null, 2),
);
writeFileSync(
  "eval/results/coach-summary.json",
  JSON.stringify(
    {
      measured: !isExample,
      fixturePath,
      answers: fixtures.length,
      lines: counts.combined.lines,
      humans,
      models: counts,
    },
    null,
    2,
  ),
);

const row = (name: string, c: AgreementCounts, ms: string) =>
  `| ${name} | ${c.answersAgree} of ${c.answers} | ${c.linesAgree} of ${c.lines} | ${c.falseMisses} | ${c.abstained} | ${ms} |`;

console.log(`\n${fixtures.length} answers, ${counts.combined.lines} labelled lines (vs labeller A)`);
if (humans) {
  console.log(
    `Human vs human (the ceiling): ${humans.answersAgree} of ${humans.answers} answers, ${humans.linesAgree} of ${humans.lines} lines\n`,
  );
}
console.log("| Configuration | Answers agree | Lines agree | False misses | Undecided | Median ms |");
console.log("| --- | --- | --- | --- | --- | --- |");
console.log(row("Nano alone", counts.nano, String(median(rows.map((r) => r.ms.nano)))));
console.log(row("Ultra alone", counts.ultra, String(median(rows.map((r) => r.ms.ultra)))));
console.log(
  row("Parallel combined", counts.combined, String(median(rows.map((r) => Math.max(r.ms.nano, r.ms.ultra))))),
);
console.log("\nUndecided = disputed lines left to the candidate (or a model that failed). Counts, not percentages.");
