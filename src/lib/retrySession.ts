import { rateAnswer } from "@/agent/rateAnswer";
import { applyView } from "./thread";
import type { SavedSession } from "./history";
import type { Topic } from "@/types";

export function retryableAnswers(session: SavedSession): number {
  return session.rounds.filter((round) => round.outcome === null || round.outcome.status === "failed").length;
}

/** Retry the original words against the exact rubric saved for each turn. */
export async function retrySession(
  session: SavedSession,
  topics: Map<string, Topic>,
  options: {
    ownApiKey?: string;
    endpoint?: string;
    fetchImpl?: typeof fetch;
    onProgress?: (session: SavedSession, completed: number, total: number) => void;
  } = {},
): Promise<SavedSession> {
  let updated = { ...session, rounds: [...session.rounds] };
  const total = retryableAnswers(session);
  let completed = 0;
  for (const [index, round] of session.rounds.entries()) {
    if (round.outcome && round.outcome.status !== "failed") continue;
    const base = topics.get(round.topicId);
    // A narrowed interview answer must never be graded against the whole topic.
    if (!base || (session.mode === "thread" && !round.view)) continue;
    const topic = round.view ? applyView(base, round.view) : base;
    const outcome = await rateAnswer({
      topic,
      transcript: round.transcript,
      ownApiKey: options.ownApiKey,
      endpoint: options.endpoint,
      fetchImpl: options.fetchImpl,
    });
    const now = new Date().toISOString();
    updated = {
      ...updated,
      savedAt: now,
      regradedAt: now,
      rounds: updated.rounds.map((item, i) => i === index ? { ...item, outcome } : item),
    };
    completed += 1;
    options.onProgress?.(updated, completed, total);
  }
  return updated;
}
