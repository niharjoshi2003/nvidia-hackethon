import { describe, expect, it } from "vitest";
import { rateAnswer } from "./rateAnswer";
import { replayFetch, replayFor } from "./replay";
import { coachTopics } from "@/data/topics";
import { SHARED_CLAIMS } from "@/data/topics/sharedClaims";

const topics = new Map(coachTopics().map((t) => [t.id, t]));

const respond = (status: number, body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("rateAnswer through replay", () => {
  it("rates the saved RAG design answer end to end", async () => {
    const topic = topics.get("rag-production-design")!;
    const saved = replayFor(topic.id)!;
    const outcome = await rateAnswer({ topic, transcript: saved.transcript, fetchImpl: replayFetch(topic.id) });

    expect(outcome.status).toBe("graded");
    if (outcome.status !== "graded") return;
    expect(outcome.replay).toBe(true);
    expect(outcome.points).toHaveLength(6);
    expect(outcome.parts.map((p) => p.status)).toEqual(["addressed", "addressed"]);
    expect(outcome.points.at(-1)).toMatchObject({ quality: "wrong", disputed: false });
    expect(outcome.points.filter((p) => p.disputed)).toHaveLength(2);
    expect(outcome.skills.map((s) => [s.nano, s.ultra])).toEqual([
      [3, 3],
      [1, 1],
    ]);
    expect(outcome.gap?.rubricLine).toBe(SHARED_CLAIMS.retrievalEval);
  });

  it("lets the contract twin close retrieval evaluation and leaves access control as the gap", async () => {
    const topic = topics.get("rag-contract-debug")!;
    const saved = replayFor(topic.id)!;
    const outcome = await rateAnswer({ topic, transcript: saved.transcript, fetchImpl: replayFetch(topic.id) });

    expect(outcome.status).toBe("graded");
    if (outcome.status !== "graded") return;
    expect(outcome.supported).toContain(SHARED_CLAIMS.retrievalEval);
    expect(outcome.parts.map((p) => p.status)).toEqual(["addressed", "disputed"]);
    expect(outcome.gap?.rubricLine).toBe(SHARED_CLAIMS.accessControl);
  });
});

describe("rateAnswer failures", () => {
  const topic = topics.get("rag-production-design")!;
  const transcript = replayFor(topic.id)!.transcript;

  it("skips an answer too short to grade without calling anything", async () => {
    const outcome = await rateAnswer({ topic, transcript: "um", fetchImpl: respond(500, {}) });
    expect(outcome.status).toBe("skipped");
  });

  it("fails when no extracted point matches the transcript", async () => {
    const outcome = await rateAnswer({
      topic,
      transcript,
      fetchImpl: respond(200, { extract: { points: [{ quote: "we use a graph database" }] }, nano: {}, ultra: {}, models: {}, calls: [] }),
    });
    expect(outcome).toMatchObject({ status: "failed", reason: "extract-error" });
  });

  it("fails when neither rating parses", async () => {
    const outcome = await rateAnswer({
      topic,
      transcript,
      fetchImpl: respond(200, {
        extract: { points: [{ quote: "I would log ingestion and querying separately too" }] },
        nano: "x",
        ultra: null,
        models: {},
        calls: [],
      }),
    });
    expect(outcome).toMatchObject({ status: "failed", reason: "grade-error" });
  });

  it("maps a server extract error", async () => {
    const outcome = await rateAnswer({ topic, transcript, fetchImpl: respond(502, { error: "extract-error", detail: "d" }) });
    expect(outcome).toMatchObject({ status: "failed", reason: "extract-error" });
  });
});
