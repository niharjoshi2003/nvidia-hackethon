import { describe, expect, it } from "vitest";
import { missesClosedOnTwin, twinsForMiss } from "./closure";
import { coachTopics, findTopic } from "@/data/topics";
import { SHARED_CLAIMS } from "@/data/topics/sharedClaims";
import type { SpokenMiss, Topic } from "@/types";

const design = findTopic("rag-production-design") as Topic;
const debug = findTopic("rag-contract-debug") as Topic;

function miss(patch: Partial<SpokenMiss> = {}): SpokenMiss {
  return {
    id: "miss_1",
    topicId: design.id,
    attemptId: "att_1",
    at: "2026-10-10T09:00:00Z",
    status: "open",
    missType: "no retrieval eval",
    category: "missing-mechanism",
    quote: "look at the prompt first",
    rubricLine: SHARED_CLAIMS.retrievalEval,
    plainLanguage: "p",
    models: { coverage: "n", judgment: "u" },
    calls: [],
    resolvedAt: null,
    resolvedBy: null,
    ...patch,
  };
}

describe("missesClosedOnTwin", () => {
  it("closes a miss when its line is covered on the twin", () => {
    expect(missesClosedOnTwin([miss()], debug, [SHARED_CLAIMS.retrievalEval])).toHaveLength(1);
  });

  it("does not close a miss when the same question is answered again", () => {
    expect(missesClosedOnTwin([miss()], design, [SHARED_CLAIMS.retrievalEval])).toHaveLength(0);
  });

  it("does not close a miss whose line was not covered", () => {
    expect(missesClosedOnTwin([miss()], debug, [SHARED_CLAIMS.accessControl])).toHaveLength(0);
  });

  it("ignores misses already resolved", () => {
    expect(missesClosedOnTwin([miss({ status: "resolved" })], debug, [SHARED_CLAIMS.retrievalEval])).toHaveLength(0);
  });
});

describe("twinsForMiss", () => {
  it("finds only other questions that grade the same line", () => {
    const ids = twinsForMiss(miss(), coachTopics()).map((t) => t.id);
    expect(ids).toContain(debug.id);
    expect(ids).not.toContain(design.id);
  });
});
