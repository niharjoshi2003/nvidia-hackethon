/**
 * Builds today's plan.
 *
 * This is where the evaluator's memory changes what the learner does next. An
 * open miss takes the front of the plan even when spaced repetition would wait,
 * which is the single behaviour that makes session two a consequence of
 * session one rather than a coincidence.
 *
 * SM-2 itself is never modified from here. Resolving the miss simply removes
 * the override and the topic falls back to its normal schedule.
 */

import type { PlanEntry, Topic, TopicProgress, Track } from "@/types";
import { isDue } from "./scheduler";

export interface PlanInput {
  topics: Topic[];
  progress: Record<string, TopicProgress>;
  /** Topic ids with an open miss, already deduplicated and newest first. */
  openMissTopicIds: string[];
  /** Short label per topic id, shown on the card to explain the placement. */
  missLabels?: Record<string, string>;
  planSize: number;
  now?: Date;
}

export function buildDailyPlan(input: PlanInput): PlanEntry[] {
  const { topics, progress, openMissTopicIds, missLabels = {}, planSize } = input;
  const now = input.now ?? new Date();

  const size = Math.max(1, Math.min(6, planSize));
  const byId = new Map(topics.map((t) => [t.id, t]));
  const taken = new Set<string>();
  const plan: PlanEntry[] = [];

  const push = (topicId: string, slot: PlanEntry["slot"], reason: string) => {
    if (plan.length >= size || taken.has(topicId) || !byId.has(topicId)) return;
    taken.add(topicId);
    plan.push({ topicId, slot, reason });
  };

  // 1. Open misses first. This is the override.
  for (const topicId of openMissTopicIds) {
    push(
      topicId,
      "open-miss",
      missLabels[topicId] ? `Open miss: ${missLabels[topicId]}` : "You have an open miss here",
    );
  }

  // 2. Genuinely due reviews, most overdue first.
  const due = topics
    .filter((t) => isDue(progress[t.id], now))
    .sort((a, b) => dueTime(progress[a.id]) - dueTime(progress[b.id]));
  for (const topic of due) push(topic.id, "due-review", "Due for review");

  // 3. Never attempted.
  const rotate = seededRotation(dayKey(now));
  for (const topic of rotate(topics.filter((t) => !progress[t.id]?.attempts))) {
    push(topic.id, "new", "New topic");
  }

  // 4. The track that has gone longest without practice.
  for (const topic of rotate(topics.filter((t) => t.track === coldestTrack(topics, progress)))) {
    push(topic.id, "cold-track", "Track you have not touched lately");
  }

  // 5. Anything else, to fill the day.
  for (const topic of rotate(topics)) push(topic.id, "wildcard", "Keeping it varied");

  return plan;
}

const dueTime = (p: TopicProgress | undefined) =>
  p?.dueAt ? new Date(p.dueAt).getTime() : Number.MAX_SAFE_INTEGER;

/** Local calendar date, so the plan is stable for a day and changes overnight. */
export function dayKey(now: Date): string {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

function coldestTrack(topics: Topic[], progress: Record<string, TopicProgress>): Track {
  const lastTouched = new Map<Track, number>();
  for (const topic of topics) {
    const at = progress[topic.id]?.lastAttemptAt;
    const time = at ? new Date(at).getTime() : 0;
    lastTouched.set(topic.track, Math.max(lastTouched.get(topic.track) ?? 0, time));
  }
  let coldest: Track = topics[0]?.track ?? "agentic";
  let coldestTime = Number.MAX_SAFE_INTEGER;
  for (const [track, time] of lastTouched) {
    if (time < coldestTime) {
      coldest = track;
      coldestTime = time;
    }
  }
  return coldest;
}

/**
 * Deterministic per-day rotation.
 *
 * The plan must be identical every time it is built on a given day, or a
 * refresh would silently reshuffle the learner's session. Seeded by the date
 * so it still varies day to day without storing anything.
 */
function seededRotation(seed: string): <T>(items: T[]) => T[] {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const offset = Math.abs(hash);
  return <T,>(items: T[]): T[] => {
    if (items.length === 0) return items;
    const start = offset % items.length;
    return [...items.slice(start), ...items.slice(0, start)];
  };
}
