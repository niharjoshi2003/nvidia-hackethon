import { describe, expect, it } from "vitest";
import { Interviewer, type InterviewContext, type InterviewerPolicy } from "./interviewer";
import { coachTopics } from "@/data/topics";
import { SHARED_CLAIMS } from "@/data/topics/sharedClaims";
import type { SpokenMiss } from "@/types";

const topics = coachTopics();

function miss(patch: Partial<SpokenMiss> = {}): SpokenMiss {
  return {
    id: `m_${Math.random()}`,
    topicId: "rag-production-design",
    attemptId: "a",
    at: "2026-10-09T09:00:00Z",
    status: "open",
    missType: "no retrieval eval",
    category: "missing-mechanism",
    quote: "q",
    rubricLine: SHARED_CLAIMS.retrievalEval,
    plainLanguage: "p",
    models: { coverage: "n", judgment: "u" },
    calls: [],
    resolvedAt: null,
    resolvedBy: null,
    ...patch,
  };
}

const ctx = (patch: Partial<InterviewContext> = {}): InterviewContext => ({
  role: "ai-engineer",
  topics,
  misses: [],
  askedTopicIds: [],
  ...patch,
});

const throwing: InterviewerPolicy = {
  pickNextQuestion: () => {
    throw new Error("boom");
  },
  getRubric: () => {
    throw new Error("boom");
  },
  pickFollowUp: () => {
    throw new Error("boom");
  },
};

describe("Interviewer with the planned policy", () => {
  it("opens with a role question when there are no misses, and logs why", async () => {
    const agent = new Interviewer();
    const choice = await agent.pickNextQuestion(ctx());
    expect(topics.find((t) => t.id === choice.topicId)?.roles).toContain("ai-engineer");
    expect(agent.trace).toEqual([
      expect.objectContaining({ tool: "pickNextQuestion", ok: true, fallback: false }),
    ]);
  });

  it("picks the twin for a line missed twice, never the miss's own question", async () => {
    const agent = new Interviewer();
    const choice = await agent.pickNextQuestion(ctx({ misses: [miss(), miss({ at: "2026-10-08T09:00:00Z" })] }));
    expect(choice.topicId).toBe("rag-contract-debug");
    expect(choice.reason).toMatch(/missed 2 times/);
  });

  it("aims the follow-up at the headline line on a different question", async () => {
    const agent = new Interviewer();
    const choice = await agent.pickFollowUp(
      ctx({ askedTopicIds: ["rag-production-design"] }),
      "rag-production-design",
      SHARED_CLAIMS.retrievalEval,
    );
    expect(choice.topicId).toBe("rag-contract-debug");
    expect(choice.targetLine).toBe(SHARED_CLAIMS.retrievalEval);
  });

  it("loads only lines that belong to the chosen question", async () => {
    const agent = new Interviewer();
    const lines = await agent.getRubric("rag-production-design", ctx());
    expect(lines).toContain(SHARED_CLAIMS.accessControl);
  });
});

describe("Interviewer fallback", () => {
  it("completes a full session with every tool forced to fail", async () => {
    const agent = new Interviewer(throwing);
    const misses = [miss()];
    const first = await agent.pickNextQuestion(ctx({ misses }));
    const rubric = await agent.getRubric(first.topicId, ctx({ misses }));
    const follow = await agent.pickFollowUp(
      ctx({ misses, askedTopicIds: [first.topicId] }),
      first.topicId,
      SHARED_CLAIMS.retrievalEval,
    );

    expect(first.topicId).toBe("rag-contract-debug");
    expect(rubric.length).toBeGreaterThan(0);
    expect(follow.topicId).not.toBe(first.topicId);
    expect(agent.trace).toHaveLength(3);
    expect(agent.trace.every((t) => t.fallback && !t.ok)).toBe(true);
    expect(agent.trace[0]?.reason).toMatch(/fixed rule took over/);
  });

  it("rejects a choice outside the catalog", async () => {
    const agent = new Interviewer({
      ...throwing,
      pickNextQuestion: () => ({ topicId: "made-up-question", reason: "trust me" }),
    });
    const choice = await agent.pickNextQuestion(ctx());
    expect(topics.some((t) => t.id === choice.topicId)).toBe(true);
    expect(agent.trace[0]?.fallback).toBe(true);
  });

  it("rejects a follow-up that repeats the same question", async () => {
    const agent = new Interviewer({
      ...throwing,
      pickFollowUp: () => ({ topicId: "rag-production-design", question: "again", targetLine: null, reason: "r" }),
    });
    const choice = await agent.pickFollowUp(ctx(), "rag-production-design", null);
    expect(choice.topicId).not.toBe("rag-production-design");
  });

  it("rejects a rubric containing lines the question does not have", async () => {
    const agent = new Interviewer({ ...throwing, getRubric: () => ["An invented rubric line for this test"] });
    const lines = await agent.getRubric("rag-production-design", ctx());
    expect(lines).not.toContain("An invented rubric line for this test");
    expect(agent.trace[0]?.fallback).toBe(true);
  });
});
