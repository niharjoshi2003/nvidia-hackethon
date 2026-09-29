/**
 * Queries over the miss log.
 *
 * The miss log is the memory that makes this a Personal AI project rather than
 * a grader: it is what causes tomorrow's session to differ from today's, and
 * it is what makes a cross-topic pattern visible that no single session could
 * show.
 */

import {
  MISS_CATEGORY_LABELS,
  type MissCategory,
  type SpokenMiss,
} from "@/types";

const newestFirst = (a: SpokenMiss, b: SpokenMiss) =>
  new Date(b.at).getTime() - new Date(a.at).getTime();

/** The miss a learner should see before speaking on this topic again. */
export function latestOpenMiss(misses: SpokenMiss[], topicId: string): SpokenMiss | undefined {
  return misses
    .filter((m) => m.topicId === topicId && m.status === "open")
    .sort(newestFirst)[0];
}

/**
 * One open miss per topic, newest first.
 *
 * Deduplicated by topic because the daily plan gives a topic a single seat.
 * Without this, three open misses on one topic would crowd out the rest of the
 * day's practice.
 */
export function openMisses(misses: SpokenMiss[]): SpokenMiss[] {
  const seen = new Set<string>();
  const result: SpokenMiss[] = [];
  for (const miss of misses.filter((m) => m.status === "open").sort(newestFirst)) {
    if (seen.has(miss.topicId)) continue;
    seen.add(miss.topicId);
    result.push(miss);
  }
  return result;
}

export function missesForTopic(misses: SpokenMiss[], topicId: string): SpokenMiss[] {
  return misses.filter((m) => m.topicId === topicId).sort(newestFirst);
}

/**
 * Find an earlier miss on the same rubric line, so a later attempt can be
 * shown beside the one that prompted it.
 */
export function priorMissOnSameLine(
  misses: SpokenMiss[],
  miss: SpokenMiss,
): SpokenMiss | undefined {
  return misses
    .filter(
      (m) =>
        m.id !== miss.id &&
        m.topicId === miss.topicId &&
        m.rubricLine === miss.rubricLine &&
        new Date(m.at).getTime() < new Date(miss.at).getTime(),
    )
    .sort(newestFirst)[0];
}

// --- cross-topic pattern ----------------------------------------------------

export interface MissPattern {
  category: MissCategory;
  label: string;
  count: number;
  /** Distinct topics this pattern showed up on. */
  topicIds: string[];
  /** Share of all misses, 0 to 1. */
  share: number;
}

/**
 * Group every miss by category, across all topics.
 *
 * This is the insight a single session cannot produce: "you skipped the
 * failure mode on seven of nine answers" is a statement about the person, not
 * about one topic, and it is only computable because the category is drawn
 * from a closed set rather than free text.
 */
export function missPatterns(misses: SpokenMiss[]): MissPattern[] {
  if (misses.length === 0) return [];

  const byCategory = new Map<MissCategory, SpokenMiss[]>();
  for (const miss of misses) {
    const bucket = byCategory.get(miss.category) ?? [];
    bucket.push(miss);
    byCategory.set(miss.category, bucket);
  }

  return [...byCategory.entries()]
    .map(([category, group]) => ({
      category,
      label: MISS_CATEGORY_LABELS[category],
      count: group.length,
      topicIds: [...new Set(group.map((m) => m.topicId))],
      share: group.length / misses.length,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Below this, a "pattern" is just noise from a handful of sessions. */
export const PATTERN_MIN_MISSES = 4;
export const PATTERN_MIN_TOPICS = 2;
export const PATTERN_MIN_SHARE = 1 / 3;

/**
 * The headline pattern, or undefined when there is not enough evidence yet.
 *
 * Requires a minimum sample, a minimum share, and presence on more than one
 * topic. The last condition matters most: a category that only ever appears on
 * one topic is a fact about that topic, not a habit worth telling someone about.
 */
export function dominantPattern(misses: SpokenMiss[]): MissPattern | undefined {
  if (misses.length < PATTERN_MIN_MISSES) return undefined;
  const top = missPatterns(misses)[0];
  if (!top) return undefined;
  if (top.share < PATTERN_MIN_SHARE) return undefined;
  if (top.topicIds.length < PATTERN_MIN_TOPICS) return undefined;
  return top;
}
