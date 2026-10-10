import { describe, expect, it } from "vitest";
import { repairAnswer, validateRepair } from "./repairAnswer";
import { replayFetch, replayFor } from "./replay";
import { SHARED_CLAIMS } from "@/data/topics/sharedClaims";

const TRANSCRIPT = "I would retry with backoff. I would cap the attempts.";
const MISSED = ["An idempotency key must be generated once per logical operation, not once per attempt"];

describe("validateRepair", () => {
  it("keeps the candidate's sentences and tagged additions", () => {
    const result = validateRepair(
      {
        sentences: [
          { text: "I would retry with backoff.", rubricLine: null },
          { text: "One key is created before the first attempt and reused.", rubricLine: MISSED[0] },
          { text: "I would cap the attempts.", rubricLine: null },
        ],
      },
      TRANSCRIPT,
      MISSED,
    );
    expect(result?.sentences).toHaveLength(3);
    expect(result?.covered).toEqual(MISSED);
    expect(result?.dropped).toBe(0);
  });

  it("drops untagged additions the candidate never said", () => {
    const result = validateRepair(
      {
        sentences: [
          { text: "One key is created once.", rubricLine: MISSED[0] },
          { text: "Also use a circuit breaker.", rubricLine: null },
        ],
      },
      TRANSCRIPT,
      MISSED,
    );
    expect(result?.sentences.map((s) => s.text)).toEqual(["One key is created once."]);
    expect(result?.dropped).toBe(1);
  });

  it("drops additions tagged with a line that was not missed", () => {
    const result = validateRepair(
      {
        sentences: [
          { text: "One key is created once.", rubricLine: MISSED[0] },
          { text: "Retry only 5xx.", rubricLine: "Retriable errors are separated from terminal ones" },
        ],
      },
      TRANSCRIPT,
      MISSED,
    );
    expect(result?.dropped).toBe(1);
  });

  it("returns null when no addition covers a missed line", () => {
    expect(
      validateRepair({ sentences: [{ text: "I would retry with backoff.", rubricLine: null }] }, TRANSCRIPT, MISSED),
    ).toBeNull();
  });
});

describe("repairAnswer on the saved demo answer", () => {
  it("adds both missed points and drops the untagged boast", async () => {
    const saved = replayFor("rag-production-design")!;
    const result = await repairAnswer({
      transcript: saved.transcript,
      missedLines: [SHARED_CLAIMS.retrievalEval, SHARED_CLAIMS.accessControl],
      fetchImpl: replayFetch(saved.topicId),
    });
    expect(result.status).toBe("repaired");
    if (result.status !== "repaired") return;
    expect(result.repair.covered).toHaveLength(2);
    expect(result.repair.dropped).toBe(1);
  });
});
