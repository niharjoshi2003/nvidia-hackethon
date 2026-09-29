/**
 * Simplified SM-2 spaced repetition over the self-rating.
 *
 * Deliberately untouched by the grading path. The evaluator influences what
 * you see next through the open-miss slot in the daily plan (see selection.ts),
 * never by editing ease or intervals here. Keeping the two separate means a
 * bad grade can never corrupt the schedule, and the schedule stays explainable.
 */

import type { SelfRating, TopicProgress } from "@/types";

export const MIN_EASE = 1.3;
export const MAX_EASE = 2.8;
export const DEFAULT_EASE = 2.3;
export const MAX_INTERVAL_DAYS = 90;

export function emptyProgress(topicId: string): TopicProgress {
  return {
    topicId,
    attempts: 0,
    lastAttemptAt: null,
    mastery: 0,
    ease: DEFAULT_EASE,
    intervalDays: 0,
    dueAt: null,
  };
}

/** SM-2 quality, 1 to 5, from the three self-ratings. */
export function qualityOf(ratings: SelfRating): number {
  const mean = (ratings.clarity + ratings.depth + ratings.structure) / 3;
  return clamp(Math.round(mean), 1, 5);
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

const addDays = (from: Date, days: number) =>
  new Date(from.getTime() + days * 24 * 60 * 60 * 1000);

export function nextSchedule(
  current: TopicProgress,
  ratings: SelfRating,
  now: Date = new Date(),
): TopicProgress {
  const quality = qualityOf(ratings);

  let ease = current.ease;
  let intervalDays: number;

  if (quality <= 2) {
    ease = clamp(ease - 0.2, MIN_EASE, MAX_EASE);
    intervalDays = 1;
  } else if (quality === 3) {
    ease = clamp(ease - 0.05, MIN_EASE, MAX_EASE);
    intervalDays = Math.max(1, Math.round(current.intervalDays * 1.2) || 1);
  } else {
    ease = clamp(ease + 0.1, MIN_EASE, MAX_EASE);
    intervalDays =
      current.intervalDays <= 0 ? 3 : Math.round(current.intervalDays * ease);
  }

  intervalDays = Math.min(intervalDays, MAX_INTERVAL_DAYS);

  return {
    topicId: current.topicId,
    attempts: current.attempts + 1,
    lastAttemptAt: now.toISOString(),
    mastery: nextMastery(current.mastery, quality),
    ease,
    intervalDays,
    dueAt: addDays(now, intervalDays).toISOString(),
  };
}

/**
 * Mastery moves toward the score this attempt implies, rather than jumping to
 * it, so one good minute on a hard topic does not read as mastered.
 */
function nextMastery(currentMastery: number, quality: number): number {
  const target = ((quality - 1) / 4) * 100;
  return clamp(Math.round(currentMastery + (target - currentMastery) * 0.4), 0, 100);
}

export function isDue(progress: TopicProgress | undefined, now: Date = new Date()): boolean {
  if (!progress || !progress.dueAt) return false;
  return new Date(progress.dueAt).getTime() <= now.getTime();
}
