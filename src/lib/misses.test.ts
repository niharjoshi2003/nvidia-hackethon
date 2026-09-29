import { describe, expect, it } from "vitest";
import {
  dominantPattern,
  latestOpenMiss,
  missPatterns,
  openMisses,
  priorMissOnSameLine,
} from "./misses";
import type { MissCategory, SpokenMiss } from "@/types";

let seq = 0;

function miss(patch: Partial<SpokenMiss> = {}): SpokenMiss {
  seq += 1;
  return {
    id: `miss_${seq}`,
    topicId: "topic-a",
    attemptId: `attempt_${seq}`,
    at: `2026-10-${String(seq).padStart(2, "0")}T09:00:00Z`,
    status: "open",
    missType: "skipped idempotency key",
    category: "missing-mechanism",
    quote: "I would retry it",
    rubricLine: "Retries must be paired with an idempotency key",
    plainLanguage: "You described retrying without saying what stops a replay.",
    models: { coverage: "nano", judgment: "ultra" },
    calls: [],
    resolvedAt: null,
    resolvedBy: null,
    ...patch,
  };
}

describe("latestOpenMiss", () => {
  it("returns the newest open miss for the topic", () => {
    const older = miss({ at: "2026-10-01T09:00:00Z" });
    const newer = miss({ at: "2026-10-09T09:00:00Z" });
    expect(latestOpenMiss([older, newer], "topic-a")?.id).toBe(newer.id);
  });

  it("ignores resolved misses", () => {
    const resolved = miss({ status: "resolved", at: "2026-10-09T09:00:00Z" });
    const open = miss({ at: "2026-10-01T09:00:00Z" });
    expect(latestOpenMiss([resolved, open], "topic-a")?.id).toBe(open.id);
  });

  it("returns nothing when every miss on the topic is resolved", () => {
    expect(latestOpenMiss([miss({ status: "resolved" })], "topic-a")).toBeUndefined();
  });
});

describe("openMisses", () => {
  it("returns one entry per topic, newest first", () => {
    const list = [
      miss({ topicId: "topic-a", at: "2026-10-01T09:00:00Z" }),
      miss({ topicId: "topic-a", at: "2026-10-08T09:00:00Z" }),
      miss({ topicId: "topic-b", at: "2026-10-04T09:00:00Z" }),
    ];
    const result = openMisses(list);
    expect(result).toHaveLength(2);
    expect(result[0]?.topicId).toBe("topic-a");
    expect(result[0]?.at).toBe("2026-10-08T09:00:00Z");
    expect(result[1]?.topicId).toBe("topic-b");
  });
});

describe("priorMissOnSameLine", () => {
  it("finds the earlier miss on the same rubric line for the before/after view", () => {
    const line = "Bound total retry attempts and surface a terminal failure";
    const earlier = miss({ at: "2026-10-01T09:00:00Z", rubricLine: line });
    const later = miss({ at: "2026-10-09T09:00:00Z", rubricLine: line });
    expect(priorMissOnSameLine([earlier, later], later)?.id).toBe(earlier.id);
  });

  it("does not match a different rubric line", () => {
    const earlier = miss({ at: "2026-10-01T09:00:00Z", rubricLine: "Something else entirely" });
    const later = miss({ at: "2026-10-09T09:00:00Z" });
    expect(priorMissOnSameLine([earlier, later], later)).toBeUndefined();
  });
});

describe("missPatterns", () => {
  const categorised = (categories: MissCategory[], topicIds: string[]) =>
    categories.map((category, i) => miss({ category, topicId: topicIds[i] ?? "topic-a" }));

  it("counts misses by category across topics", () => {
    const list = categorised(
      ["missing-failure-mode", "missing-failure-mode", "missing-tradeoff"],
      ["topic-a", "topic-b", "topic-c"],
    );
    const patterns = missPatterns(list);
    expect(patterns[0]?.category).toBe("missing-failure-mode");
    expect(patterns[0]?.count).toBe(2);
    expect(patterns[0]?.topicIds).toEqual(["topic-a", "topic-b"]);
    expect(patterns[0]?.share).toBeCloseTo(2 / 3);
  });

  it("returns nothing when there are no misses", () => {
    expect(missPatterns([])).toEqual([]);
  });
});

describe("dominantPattern", () => {
  it("reports a habit that spans several topics", () => {
    const list = [
      miss({ category: "missing-failure-mode", topicId: "topic-a" }),
      miss({ category: "missing-failure-mode", topicId: "topic-b" }),
      miss({ category: "missing-failure-mode", topicId: "topic-c" }),
      miss({ category: "missing-tradeoff", topicId: "topic-d" }),
    ];
    expect(dominantPattern(list)?.category).toBe("missing-failure-mode");
  });

  it("stays quiet until there is enough evidence", () => {
    const list = [
      miss({ category: "missing-failure-mode", topicId: "topic-a" }),
      miss({ category: "missing-failure-mode", topicId: "topic-b" }),
    ];
    expect(dominantPattern(list)).toBeUndefined();
  });

  it("does not call a single-topic habit a pattern", () => {
    // Four misses, all the same category, but all on one topic. That is a fact
    // about the topic, not about the person.
    const list = [
      miss({ category: "missing-failure-mode", topicId: "topic-a" }),
      miss({ category: "missing-failure-mode", topicId: "topic-a" }),
      miss({ category: "missing-failure-mode", topicId: "topic-a" }),
      miss({ category: "missing-failure-mode", topicId: "topic-a" }),
    ];
    expect(dominantPattern(list)).toBeUndefined();
  });

  it("stays quiet when misses are spread evenly with no clear habit", () => {
    const list = [
      miss({ category: "missing-failure-mode", topicId: "topic-a" }),
      miss({ category: "missing-tradeoff", topicId: "topic-b" }),
      miss({ category: "missing-mechanism", topicId: "topic-c" }),
      miss({ category: "incorrect-claim", topicId: "topic-d" }),
      miss({ category: "unstructured-answer", topicId: "topic-e" }),
      miss({ category: "missing-constraint", topicId: "topic-f" }),
    ];
    expect(dominantPattern(list)).toBeUndefined();
  });
});
