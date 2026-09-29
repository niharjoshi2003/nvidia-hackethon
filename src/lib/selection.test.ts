import { describe, expect, it } from "vitest";
import { buildDailyPlan } from "./selection";
import { emptyProgress } from "./scheduler";
import { seedTopics } from "@/data/topics";
import type { TopicProgress } from "@/types";

const NOW = new Date("2026-10-15T09:00:00Z");

const topics = seedTopics.slice(0, 8);
const [first, second, third] = topics;

function progressFor(
  entries: Array<[string, Partial<TopicProgress>]>,
): Record<string, TopicProgress> {
  return Object.fromEntries(
    entries.map(([id, patch]) => [id, { ...emptyProgress(id), ...patch }]),
  );
}

/** A topic that spaced repetition says is overdue and should normally lead. */
const overdue = (): Partial<TopicProgress> => ({
  attempts: 3,
  lastAttemptAt: "2026-10-01T09:00:00Z",
  dueAt: "2026-10-05T09:00:00Z",
  intervalDays: 4,
  mastery: 40,
});

/** A topic SM-2 would not show for weeks. */
const notDueForAges = (): Partial<TopicProgress> => ({
  attempts: 5,
  lastAttemptAt: "2026-10-10T09:00:00Z",
  dueAt: "2026-12-01T09:00:00Z",
  intervalDays: 52,
  mastery: 85,
});

describe("buildDailyPlan", () => {
  it("puts an open miss ahead of an overdue review", () => {
    const plan = buildDailyPlan({
      topics,
      progress: progressFor([
        [first!.id, notDueForAges()],
        [second!.id, overdue()],
      ]),
      openMissTopicIds: [first!.id],
      planSize: 4,
      now: NOW,
    });

    expect(plan[0]?.topicId).toBe(first!.id);
    expect(plan[0]?.slot).toBe("open-miss");
    // The overdue topic is still on the plan, just not first.
    expect(plan.map((e) => e.topicId)).toContain(second!.id);
  });

  it("surfaces a topic with an open miss even though SM-2 would wait weeks", () => {
    const plan = buildDailyPlan({
      topics,
      progress: progressFor([[first!.id, notDueForAges()]]),
      openMissTopicIds: [first!.id],
      planSize: 4,
      now: NOW,
    });

    expect(plan.some((e) => e.topicId === first!.id)).toBe(true);
  });

  it("drops the topic back to its normal schedule once the miss is resolved", () => {
    const progress = progressFor([
      [first!.id, notDueForAges()],
      [second!.id, overdue()],
    ]);

    const withMiss = buildDailyPlan({
      topics,
      progress,
      openMissTopicIds: [first!.id],
      planSize: 4,
      now: NOW,
    });
    const resolved = buildDailyPlan({
      topics,
      progress,
      openMissTopicIds: [],
      planSize: 4,
      now: NOW,
    });

    expect(withMiss[0]?.topicId).toBe(first!.id);
    expect(resolved[0]?.topicId).toBe(second!.id);
    expect(resolved[0]?.slot).toBe("due-review");
    expect(resolved.find((e) => e.slot === "open-miss")).toBeUndefined();
  });

  it("shows the miss label on the card so the placement is explained", () => {
    const plan = buildDailyPlan({
      topics,
      progress: {},
      openMissTopicIds: [first!.id],
      missLabels: { [first!.id]: "skipped idempotency key" },
      planSize: 3,
      now: NOW,
    });

    expect(plan[0]?.reason).toContain("skipped idempotency key");
  });

  it("gives a topic one seat even with several open misses on it", () => {
    const plan = buildDailyPlan({
      topics,
      progress: {},
      // openMisses() dedupes upstream; this guards the plan against a caller
      // that forgets to.
      openMissTopicIds: [first!.id, first!.id, second!.id],
      planSize: 4,
      now: NOW,
    });

    expect(plan.filter((e) => e.topicId === first!.id)).toHaveLength(1);
    expect(plan[1]?.topicId).toBe(second!.id);
  });

  it("never repeats a topic and respects the plan size", () => {
    const plan = buildDailyPlan({
      topics,
      progress: progressFor([[third!.id, overdue()]]),
      openMissTopicIds: [first!.id],
      planSize: 4,
      now: NOW,
    });

    expect(plan).toHaveLength(4);
    expect(new Set(plan.map((e) => e.topicId)).size).toBe(4);
  });

  it("is stable across rebuilds on the same day", () => {
    const args = {
      topics,
      progress: {},
      openMissTopicIds: [],
      planSize: 4,
      now: NOW,
    };
    expect(buildDailyPlan(args)).toEqual(buildDailyPlan(args));
  });

  it("varies from one day to the next", () => {
    const base = { topics, progress: {}, openMissTopicIds: [], planSize: 4 };
    const today = buildDailyPlan({ ...base, now: NOW });
    const laterDay = buildDailyPlan({ ...base, now: new Date("2026-10-19T09:00:00Z") });
    expect(today.map((e) => e.topicId)).not.toEqual(laterDay.map((e) => e.topicId));
  });

  it("ignores an open miss for a topic that no longer exists", () => {
    const plan = buildDailyPlan({
      topics,
      progress: {},
      openMissTopicIds: ["deleted-topic"],
      planSize: 3,
      now: NOW,
    });

    expect(plan.some((e) => e.topicId === "deleted-topic")).toBe(false);
    expect(plan).toHaveLength(3);
  });
});
