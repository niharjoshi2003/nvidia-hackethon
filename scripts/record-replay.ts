/**
 * Record real model output for replay mode.
 *
 * Sends each saved answer in src/data/replay.json through the real handler,
 * in rate, parallel, and repair mode, and writes the raw responses back with
 * source: "recorded". The UI then labels replays as recorded, not authored.
 *
 * Run:   npm run replay:record
 * Needs: TOKEN_FACTORY_API_KEY, NEMOTRON_NANO, NEMOTRON_ULTRA in .env
 */

import { readFileSync, writeFileSync } from "node:fs";
import handler from "../api/grade";
import { findTopic } from "@/data/topics";
import { combinePoints, gateExtraction, gateRating, pickGap } from "@/agent/rateSchema";

const PATH = "src/data/replay.json";
const KEY = process.env.TOKEN_FACTORY_API_KEY;
if (!KEY) {
  console.error("Set TOKEN_FACTORY_API_KEY, NEMOTRON_NANO and NEMOTRON_ULTRA in .env first.");
  process.exit(1);
}

interface Recording {
  topicId: string;
  transcript: string;
  rate?: { models: unknown; extract: unknown; nano: unknown; ultra: unknown };
  parallel: { models: unknown; nano: unknown; ultra: unknown };
  repair: unknown;
}

const data = JSON.parse(readFileSync(PATH, "utf8")) as { recordings: Recording[] };

async function post(body: unknown) {
  const res = await handler(
    new Request("http://record.local/api/grade", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-token-factory-key": KEY! },
      body: JSON.stringify(body),
    }),
  );
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(json)}`);
  return json;
}

const recordings: Recording[] = [];
for (const rec of data.recordings) {
  const topic = findTopic(rec.topicId);
  if (!topic) throw new Error(`unknown topic ${rec.topicId}`);
  const keyPoints = topic.scaffold.keyPoints;
  const parts = topic.parts ?? [topic.framing];
  const skills = topic.skills ?? [];

  const rate = await post({
    mode: "rate",
    question: topic.framing,
    transcript: rec.transcript,
    parts,
    keyPoints,
    skills,
  });
  const points = gateExtraction(rate.extract, rec.transcript);
  const ctx = { transcript: rec.transcript, points, parts, keyPoints, skills };
  const nano = gateRating(rate.nano, ctx);
  const ultra = gateRating(rate.ultra, ctx);
  const gap = pickGap(combinePoints(points, nano, ultra), nano, ultra);
  const missed = gap ? [gap.rubricLine] : [];

  const parallel = await post({ mode: "parallel", transcript: rec.transcript, keyPoints });

  const repair = missed.length
    ? (await post({ mode: "repair", transcript: rec.transcript, missedLines: missed })).repair
    : { sentences: [] };

  recordings.push({
    topicId: rec.topicId,
    transcript: rec.transcript,
    rate: { models: rate.models, extract: rate.extract, nano: rate.nano, ultra: rate.ultra },
    parallel: { models: parallel.models, nano: parallel.nano, ultra: parallel.ultra },
    repair,
  });
  console.log(`  ${rec.topicId}: recorded (${points.length} points, gap: ${gap ? "agreed" : "none"})`);
}

writeFileSync(
  PATH,
  `${JSON.stringify(
    {
      source: "recorded",
      note: `Recorded from a live run on ${new Date().toISOString().slice(0, 10)} with npm run replay:record.`,
      recordings,
    },
    null,
    2,
  )}\n`,
);
console.log(`Wrote ${PATH}. Re-run the tests: the replay assertions describe the authored responses.`);
