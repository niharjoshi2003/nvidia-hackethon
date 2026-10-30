/** Regrade an exported interview without changing its words or turn rubrics. */
import { readFileSync, writeFileSync } from "node:fs";
import { coachTopics } from "@/data/topics";
import { parseHistoryFile, serialiseHistory } from "@/lib/history";
import { retrySession } from "@/lib/retrySession";
import { buildScorecard, turnFromSaved } from "@/lib/thread";
import { repairAnswer } from "@/agent/repairAnswer";

const [, , input, output] = process.argv;
if (!input || !output) throw new Error("Usage: vite-node scripts/recover-session.ts INPUT.json OUTPUT.json");
const parsed = parseHistoryFile(readFileSync(input, "utf8"));
if (!parsed.ok) throw new Error(parsed.error);
const topics = new Map(coachTopics().map((topic) => [topic.id, topic]));
const endpoint = process.env.RECOVERY_ENDPOINT || "http://127.0.0.1:5173/api/grade";

for (const [index, original] of parsed.sessions.entries()) {
  const session = await retrySession(original, topics, {
    endpoint,
    onProgress: (updated, completed, total) => {
      parsed.sessions[index] = updated;
      writeFileSync(output, serialiseHistory(parsed.sessions));
      console.log(JSON.stringify({ completed, total, status: updated.rounds[completed - 1]?.outcome?.status }));
    },
  });
  const base = topics.get(session.rounds[0]!.topicId)!;
  if (session.mode === "thread" && session.rounds.every((r) => r.view)) {
    const card = buildScorecard(base, session.rounds.map((round, i) => ({
      turn: turnFromSaved(base, {
        kind: round.kind === "opening" || round.kind === "followup" ? "scoped" : round.kind,
        prompt: round.prompt,
        view: round.view!,
      }, i),
      outcome: round.outcome,
    })));
    console.log(JSON.stringify({ rated: card.rated, total: session.rounds.length, overall: card.overall, gap: card.gap?.rubricLine }));
    if (card.gap) {
      const repair = await repairAnswer({
        transcript: session.rounds.map((r) => r.transcript).join(" ").slice(0, 6000),
        missedLines: [card.gap.rubricLine], endpoint,
      });
      if (repair.status === "repaired") session.repair = { sentences: repair.repair.sentences, dropped: repair.repair.dropped };
      console.log(`Repair: ${repair.status}`);
    }
    writeFileSync(`${output}.scorecard.json`, JSON.stringify(card, null, 2));
  }
  parsed.sessions[index] = session;
  writeFileSync(output, serialiseHistory(parsed.sessions));
}
