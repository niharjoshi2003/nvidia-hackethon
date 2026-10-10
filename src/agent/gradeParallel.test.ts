import { describe, expect, it, vi } from "vitest";
import { gradeParallel } from "./gradeParallel";
import { replayFetch, replayFor } from "./replay";
import { findTopic } from "@/data/topics";
import { SHARED_CLAIMS } from "@/data/topics/sharedClaims";
import type { Topic } from "@/types";

const topic = findTopic("rag-production-design") as Topic;
const keyPoints = topic.scaffold.keyPoints;
const TRANSCRIPT =
  "I would chunk by headings and run keyword and vector search, then rerank before the model reads anything.";

function respond(body: unknown, status = 200) {
  return vi.fn(
    async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  ) as unknown as typeof fetch;
}

const allMissed = { lines: keyPoints.map((line) => ({ line, status: "missed", quote: "" })) };

describe("gradeParallel", () => {
  it("does not call the endpoint for an empty answer", async () => {
    const fetchImpl = respond({});
    const result = await gradeParallel({ topic, transcript: "um uh", fetchImpl });
    expect(result.status).toBe("skipped");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends only the transcript and key points, in parallel mode", async () => {
    const fetchImpl = respond({ nano: allMissed, ultra: allMissed, models: { nano: "n", ultra: "u" }, calls: [] });
    await gradeParallel({ topic, transcript: TRANSCRIPT, fetchImpl });
    const body = JSON.parse(String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]?.body));
    expect(body).toEqual({ mode: "parallel", transcript: TRANSCRIPT, keyPoints });
  });

  it("marks the result partial when one model failed", async () => {
    const result = await gradeParallel({
      topic,
      transcript: TRANSCRIPT,
      fetchImpl: respond({ nano: null, ultra: allMissed, models: { nano: null, ultra: "u" }, calls: [] }),
    });
    expect(result.status).toBe("graded");
    if (result.status !== "graded") return;
    expect(result.partial).toBe(true);
    expect(result.lines.every((l) => l.nano === null && l.status === "missed")).toBe(true);
  });

  it("fails when neither response has the expected shape", async () => {
    const result = await gradeParallel({
      topic,
      transcript: TRANSCRIPT,
      fetchImpl: respond({ nano: { x: 1 }, ultra: "junk", models: {}, calls: [] }),
    });
    expect(result).toMatchObject({ status: "failed", reason: "grade-error" });
  });

  it("maps a 429 to rate-limited", async () => {
    const result = await gradeParallel({
      topic,
      transcript: TRANSCRIPT,
      fetchImpl: respond({ error: "rate-limited", detail: "slow down" }, 429),
    });
    expect(result).toMatchObject({ status: "failed", reason: "rate-limited", detail: "slow down" });
  });

  it("reports a network failure instead of throwing", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    const result = await gradeParallel({ topic, transcript: TRANSCRIPT, fetchImpl });
    expect(result).toMatchObject({ status: "failed", reason: "network-error", detail: "offline" });
  });
});

describe("replay through the real client path", () => {
  const saved = replayFor("rag-production-design")!;

  it("grades the saved answer: retrieval evaluation is the headline, logging is disputed", async () => {
    const result = await gradeParallel({
      topic,
      transcript: saved.transcript,
      fetchImpl: replayFetch(topic.id),
    });
    expect(result.status).toBe("graded");
    if (result.status !== "graded") return;
    expect(result.replay).toBe(true);
    expect(result.calls.every((c) => c.provider === "replay")).toBe(true);
    expect(result.headline?.rubricLine).toBe(SHARED_CLAIMS.retrievalEval);

    const status = (line: string) => result.lines.find((l) => l.line === line)?.status;
    // Nano claimed access control with a quote that was never said; the gate demotes it.
    expect(status(SHARED_CLAIMS.accessControl)).toBe("missed");
    expect(result.lines.filter((l) => l.status === "disputed")).toHaveLength(1);
  });

  it("refuses to replay verdicts against a different transcript", async () => {
    const result = await gradeParallel({ topic, transcript: TRANSCRIPT, fetchImpl: replayFetch(topic.id) });
    expect(result.status).toBe("failed");
  });
});
