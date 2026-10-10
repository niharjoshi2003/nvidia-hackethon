/**
 * Twin-based miss closure.
 *
 * A miss closes only when the same rubric line is covered on a different
 * question. Answering the same question again after seeing the miss proves
 * recall of the feedback, not that the point is now part of how you answer.
 */

import type { SpokenMiss, Topic } from "@/types";

/** Open misses that this answer, on `topic`, closes. */
export function missesClosedOnTwin(
  misses: readonly SpokenMiss[],
  topic: Topic,
  coveredLines: readonly string[],
): SpokenMiss[] {
  if (coveredLines.length === 0) return [];
  const covered = new Set(coveredLines);
  const graded = new Set(topic.scaffold.keyPoints);
  return misses.filter(
    (m) =>
      m.status === "open" &&
      m.topicId !== topic.id &&
      graded.has(m.rubricLine) &&
      covered.has(m.rubricLine),
  );
}

/** Questions other than the miss's own that grade the same rubric line. */
export function twinsForMiss(miss: SpokenMiss, topics: readonly Topic[]): Topic[] {
  return topics.filter(
    (t) => t.id !== miss.topicId && t.scaffold.keyPoints.includes(miss.rubricLine),
  );
}
