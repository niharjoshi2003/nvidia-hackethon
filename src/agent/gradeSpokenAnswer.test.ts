import { describe, expect, it, vi } from "vitest";
import { gradeSpokenAnswer } from "./gradeSpokenAnswer";
import { seedTopics } from "@/data/topics";
import type { Topic } from "@/types";

const topic = seedTopics.find((t) => t.id === "agentic-tool-retries") as Topic;

const TRANSCRIPT =
  "So when a payment call fails I would retry it with exponential backoff and " +
  "some jitter, and I would cap it at five attempts before returning an error " +
  "to the caller so we do not loop forever on a broken dependency.";

function respond(body: unknown, status = 200) {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  ) as unknown as typeof fetch;
}

const goodJudgment = {
  missType: "skipped idempotency key",
  category: "missing-mechanism",
  quote: "I would retry it",
  rubricLine: topic.scaffold.keyPoints[1],
  plainLanguage: "You described retrying but never said what stops a replay charging twice.",
  coveredRubricLines: [topic.scaffold.keyPoints[3]],
};

const okBody = (judgment: unknown, coverage: unknown = { covered: [], skipped: [] }) => ({
  coverage,
  judgment,
  models: { coverage: "nemotron-nano", judgment: "nemotron-ultra" },
  calls: [
    { purpose: "coverage", model: "nemotron-nano", ok: true, ms: 400 },
    { purpose: "judgment", model: "nemotron-ultra", ok: true, ms: 2100 },
  ],
});

describe("gradeSpokenAnswer", () => {
  it("returns a grounded miss when the judgment cites properly", async () => {
    const result = await gradeSpokenAnswer({
      topic,
      transcript: TRANSCRIPT,
      fetchImpl: respond(okBody(goodJudgment)),
    });

    expect(result.status).toBe("graded");
    if (result.status !== "graded") return;
    expect(result.miss.rubricLine).toBe(topic.scaffold.keyPoints[1]);
    expect(TRANSCRIPT.toLowerCase()).toContain(result.miss.quote.toLowerCase());
    expect(result.miss.models.judgment).toBe("nemotron-ultra");
  });

  it("never calls the models when nothing was said", async () => {
    const fetchImpl = respond(okBody(goodJudgment));
    const result = await gradeSpokenAnswer({ topic, transcript: "  um, uh  ", fetchImpl });

    expect(result.status).toBe("skipped");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a miss quoting words the speaker never said", async () => {
    const result = await gradeSpokenAnswer({
      topic,
      transcript: TRANSCRIPT,
      fetchImpl: respond(okBody({ ...goodJudgment, quote: "I would use a distributed lock" })),
    });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toBe("quote-not-in-transcript");
  });

  it("rejects a miss citing a rubric line we never supplied", async () => {
    const result = await gradeSpokenAnswer({
      topic,
      transcript: TRANSCRIPT,
      fetchImpl: respond(
        okBody({ ...goodJudgment, rubricLine: "Always use a two-phase commit here" }),
      ),
    });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toBe("rubric-line-not-supplied");
  });

  it("accepts a no-miss verdict when the coverage pass confirmed every key point", async () => {
    const result = await gradeSpokenAnswer({
      topic,
      transcript: TRANSCRIPT,
      fetchImpl: respond(
        okBody(
          { noMiss: true, coveredRubricLines: [topic.scaffold.commonGotchas[0]] },
          { covered: topic.scaffold.keyPoints, skipped: [] },
        ),
      ),
    });

    expect(result.status).toBe("clean");
    if (result.status !== "clean") return;
    expect(result.coverage.covered).toEqual(
      expect.arrayContaining([...topic.scaffold.keyPoints, topic.scaffold.commonGotchas[0]]),
    );
  });

  it("rejects a no-miss verdict when coverage evidence is not in the transcript", async () => {
    const result = await gradeSpokenAnswer({
      topic,
      transcript: TRANSCRIPT,
      fetchImpl: respond(
        okBody(
          { noMiss: true },
          {
            items: topic.scaffold.keyPoints.map((point) => ({
              point,
              status: "covered",
              evidence: "this sentence was never spoken",
            })),
          },
        ),
      ),
    });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toBe("clean-contradicts-coverage");
  });

  it("rejects a no-miss verdict when the coverage pass found a skipped key point", async () => {
    const [first, ...rest] = topic.scaffold.keyPoints;
    const result = await gradeSpokenAnswer({
      topic,
      transcript: TRANSCRIPT,
      fetchImpl: respond(okBody({ noMiss: true }, { covered: rest, skipped: [first] })),
    });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toBe("clean-contradicts-coverage");
  });

  it("does not let a malformed coverage response vouch for a no-miss verdict", async () => {
    const result = await gradeSpokenAnswer({
      topic,
      transcript: TRANSCRIPT,
      fetchImpl: respond(okBody({ noMiss: true }, null)),
    });

    expect(result.status).toBe("rejected");
  });

  it("reports the shared demo quota distinctly so the UI can offer a key", async () => {
    const result = await gradeSpokenAnswer({
      topic,
      transcript: TRANSCRIPT,
      fetchImpl: respond({ error: "quota-reached", detail: "budget spent" }, 429),
    });

    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.reason).toBe("quota-reached");
  });

  it("fails cleanly when the judgment model errors", async () => {
    const result = await gradeSpokenAnswer({
      topic,
      transcript: TRANSCRIPT,
      fetchImpl: respond({ error: "judgment-error", detail: "timeout after 20s", calls: [] }, 502),
    });

    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.reason).toBe("judgment-error");
  });

  it("fails cleanly when the network is unavailable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("Failed to fetch");
    }) as unknown as typeof fetch;

    const result = await gradeSpokenAnswer({ topic, transcript: TRANSCRIPT, fetchImpl });
    expect(result.status).toBe("failed");
    if (result.status !== "failed") return;
    expect(result.reason).toBe("network-error");
  });

  it("forwards a user-supplied key and omits the header otherwise", async () => {
    const withKey = respond(okBody(goodJudgment));
    await gradeSpokenAnswer({
      topic,
      transcript: TRANSCRIPT,
      ownApiKey: "sk-test",
      fetchImpl: withKey,
    });
    const headers = (vi.mocked(withKey).mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>;
    expect(headers["x-token-factory-key"]).toBe("sk-test");

    const withoutKey = respond(okBody(goodJudgment));
    await gradeSpokenAnswer({ topic, transcript: TRANSCRIPT, fetchImpl: withoutKey });
    const plain = (vi.mocked(withoutKey).mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>;
    expect(plain["x-token-factory-key"]).toBeUndefined();
  });

  it("sends only the transcript and this topic's rubric", async () => {
    const fetchImpl = respond(okBody(goodJudgment));
    await gradeSpokenAnswer({ topic, transcript: TRANSCRIPT, fetchImpl });

    const body = JSON.parse(String(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.body));
    expect(Object.keys(body).sort()).toEqual([
      "gotchas",
      "keyPoints",
      "modelAnswerLines",
      "transcript",
    ]);
    expect(body.transcript).toBe(TRANSCRIPT);
  });
});
