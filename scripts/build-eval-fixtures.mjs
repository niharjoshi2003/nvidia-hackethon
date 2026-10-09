/**
 * One-off generator: builds eval/fixtures.json from seed rubrics.
 * Each topic gets a "complete" answer (all key points) and an "omission"
 * answer (one primary miss). Labels match the omitted line; both labellers
 * agree on synthetic fixtures — replace with independent human labels when
 * you record real spoken answers.
 */
import { writeFileSync } from "node:fs";
import { seedTopics } from "../src/data/topics/index.ts";

function transcriptFromKeyPoints(points, omitLine) {
  const lines = omitLine ? points.filter((p) => p !== omitLine) : [...points];
  return lines.map((p) => (p.endsWith(".") ? p : `${p}.`)).join(" ");
}

const fixtures = [];

for (const topic of seedTopics) {
  const kp = topic.scaffold.keyPoints;
  const primaryMiss = kp[1] ?? kp[0];

  fixtures.push({
    id: `${topic.id}-complete`,
    topicId: topic.id,
    kind: "complete",
    transcript: transcriptFromKeyPoints(kp),
    labels: { a: null, b: null },
  });

  fixtures.push({
    id: `${topic.id}-omission`,
    topicId: topic.id,
    kind: "omission",
    transcript: transcriptFromKeyPoints(kp, primaryMiss),
    labels: { a: primaryMiss, b: primaryMiss },
  });
}

// Noisy transcripts: ASR-style garbling on three topics
const noisyTargets = seedTopics.slice(0, 3);
for (const topic of noisyTargets) {
  const kp = topic.scaffold.keyPoints;
  const primaryMiss = kp[1] ?? kp[0];
  const base = transcriptFromKeyPoints(kp, primaryMiss);
  fixtures.push({
    id: `${topic.id}-noisy-omission`,
    topicId: topic.id,
    kind: "noisy",
    transcript: base.replace(/\bidempotency\b/gi, "item potency").replace(/\btimeout\b/gi, "time out"),
    labels: { a: primaryMiss, b: primaryMiss },
  });
}

writeFileSync("eval/fixtures.json", `${JSON.stringify(fixtures, null, 2)}\n`);
console.log(`Wrote ${fixtures.length} fixtures across ${seedTopics.length} topics.`);
