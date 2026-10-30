import { beforeEach, describe, expect, it, vi } from "vitest";
import { rateAnswer } from "@/agent/rateAnswer";
import { interviewTopics } from "@/data/topics/interview";
import { buildSession } from "./history";
import { retryableAnswers, retrySession } from "./retrySession";

vi.mock("@/agent/rateAnswer", () => ({ rateAnswer: vi.fn() }));
const rate = vi.mocked(rateAnswer);
const topic = interviewTopics[0]!;
const topics = new Map([[topic.id, topic]]);
const view = {
  framing: "Where do permission filters live?",
  parts: ["Pick where the permission rule lives and say why"],
  skills: [topic.skills![0]!],
  keyPoints: [topic.scaffold.keyPoints[1]!],
};
const failure = { status: "failed", reason: "network-error", detail: "HTTP 500", calls: [] } as const;
const session = () => buildSession({
  startedAt: "2026-10-30T11:11:32.398Z", role: "ai-engineer", mode: "thread",
  rounds: [{ topicId: topic.id, kind: "tradeoff", prompt: view.framing, reason: "A decision", transcript: "Keep the permission filter inside the retrieval query.", spokenSeconds: 22, outcome: { ...failure, calls: [] }, view }],
  trace: [], repair: null, closed: [], titleFor: () => topic.title,
})!;

beforeEach(() => vi.clearAllMocks());

describe("recovering saved interview ratings", () => {
  it("sends the unchanged words and only the saved turn rubric, persisting each result", async () => {
    const original = session();
    const progress = vi.fn();
    rate.mockResolvedValue({ status: "skipped", reason: "empty-transcript", calls: [] });
    const result = await retrySession(original, topics, { onProgress: progress });
    expect(rate).toHaveBeenCalledWith(expect.objectContaining({
      transcript: original.rounds[0]!.transcript,
      topic: expect.objectContaining({ framing: view.framing, parts: view.parts, scaffold: expect.objectContaining({ keyPoints: view.keyPoints }) }),
    }));
    expect(original.rounds[0]!.outcome?.status).toBe("failed");
    expect(result.rounds[0]!.outcome?.status).toBe("skipped");
    expect(result.rounds[0]!.transcript).toBe(original.rounds[0]!.transcript);
    expect(result.regradedAt).toBeTruthy();
    expect(progress).toHaveBeenCalledWith(result, 1, 1);
  });

  it("does not call models again for settled answers", async () => {
    const original = session();
    original.rounds[0]!.outcome = { status: "skipped", reason: "empty-transcript", calls: [] };
    expect(retryableAnswers(original)).toBe(0);
    await retrySession(original, topics);
    expect(rate).not.toHaveBeenCalled();
  });

  it("keeps the failure when a narrowed interview rubric is missing", async () => {
    const original = session();
    delete original.rounds[0]!.view;
    const result = await retrySession(original, topics);
    expect(rate).not.toHaveBeenCalled();
    expect(result.rounds[0]!.outcome?.status).toBe("failed");
  });
});
