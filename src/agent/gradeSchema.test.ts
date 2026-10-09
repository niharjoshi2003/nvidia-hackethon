import { describe, expect, it } from "vitest";
import { validateCoverage, validateJudgment } from "./gradeSchema";

const TRANSCRIPT =
  "So when a payment call fails I would retry it. I'd use exponential backoff " +
  "with some jitter so a lot of clients don't all come back at the same moment. " +
  "I'd cap it at five attempts and then return an error to the caller.";

const SUPPLIED = [
  "Retries must be paired with an idempotency key so a replayed request does not charge twice",
  "Use exponential backoff with jitter to avoid synchronized retry storms",
  "Bound total retry attempts and surface a terminal failure to the caller",
  "Treating a timeout as a definite failure and re-issuing an unguarded write",
];

const validJudgment = {
  missType: "skipped idempotency key",
  category: "missing-mechanism",
  quote: "I would retry it",
  rubricLine: SUPPLIED[0],
  plainLanguage: "You described retrying but never said what stops a replay from charging twice.",
  coveredRubricLines: [SUPPLIED[1]],
};

describe("validateJudgment", () => {
  it("accepts a judgment that cites the transcript and the supplied rubric", () => {
    const result = validateJudgment(validJudgment, TRANSCRIPT, SUPPLIED);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rubricLine).toBe(SUPPLIED[0]);
    expect(result.value.category).toBe("missing-mechanism");
  });

  it("rejects a quote the speaker never said", () => {
    const result = validateJudgment(
      { ...validJudgment, quote: "I would use a distributed lock" },
      TRANSCRIPT,
      SUPPLIED,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("quote-not-in-transcript");
  });

  it("rejects a rubric line that was reworded rather than copied", () => {
    const result = validateJudgment(
      { ...validJudgment, rubricLine: "You should use idempotency keys when retrying" },
      TRANSCRIPT,
      SUPPLIED,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("rubric-line-not-supplied");
  });

  it("rejects a rubric line borrowed from a different topic", () => {
    const result = validateJudgment(
      { ...validJudgment, rubricLine: "Shard the write path before the read path" },
      TRANSCRIPT,
      SUPPLIED,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("rubric-line-not-supplied");
  });

  it("rejects a category outside the closed set, so the pattern view stays computable", () => {
    const result = validateJudgment(
      { ...validJudgment, category: "needs-more-depth" },
      TRANSCRIPT,
      SUPPLIED,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("category-not-recognised");
  });

  it("rejects an empty quote rather than treating it as trivially present", () => {
    const result = validateJudgment({ ...validJudgment, quote: "   " }, TRANSCRIPT, SUPPLIED);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Empty strings are a substring of everything, which would ground anything.
    expect(["schema-invalid", "quote-not-in-transcript"]).toContain(result.reason);
  });

  it("rejects a response missing required fields", () => {
    const result = validateJudgment({ missType: "vague" }, TRANSCRIPT, SUPPLIED);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("schema-invalid");
  });

  it("matches citations despite casing and whitespace differences", () => {
    const result = validateJudgment(
      { ...validJudgment, quote: "I   WOULD   retry it", rubricLine: SUPPLIED[0]!.toUpperCase() },
      TRANSCRIPT,
      SUPPLIED,
    );
    expect(result.ok).toBe(true);
  });

  it("returns the speaker's original casing for the quote", () => {
    const result = validateJudgment(
      { ...validJudgment, quote: "exponential backoff with some jitter" },
      TRANSCRIPT,
      SUPPLIED,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(TRANSCRIPT).toContain(result.value.quote);
  });

  it("drops covered lines that were not supplied", () => {
    const result = validateJudgment(
      { ...validJudgment, coveredRubricLines: [SUPPLIED[1], "something invented"] },
      TRANSCRIPT,
      SUPPLIED,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.coveredRubricLines).toEqual([SUPPLIED[1]]);
  });
});

describe("validateCoverage", () => {
  const keyPoints = SUPPLIED.slice(0, 3);

  it("keeps supplied lines and reports invented ones", () => {
    const result = validateCoverage(
      { covered: [keyPoints[1]], skipped: [keyPoints[0], "use a saga pattern"] },
      keyPoints,
    );
    expect(result.covered).toEqual([keyPoints[1]]);
    expect(result.skipped).toEqual([keyPoints[0]]);
    expect(result.invented).toEqual(["use a saga pattern"]);
  });

  it("canonicalises to the supplied spelling so later equality checks hold", () => {
    const result = validateCoverage({ covered: [keyPoints[0]!.toUpperCase()], skipped: [] }, keyPoints);
    expect(result.covered).toEqual([keyPoints[0]]);
  });

  it("counts a point covered only when its evidence occurs in the transcript", () => {
    const result = validateCoverage(
      {
        items: [
          {
            point: keyPoints[1],
            status: "covered",
            evidence: "exponential backoff with some jitter",
          },
          {
            point: keyPoints[0],
            status: "covered",
            evidence: "I definitely mentioned an idempotency key",
          },
        ],
      },
      keyPoints,
      TRANSCRIPT,
    );
    expect(result.covered).toEqual([keyPoints[1]]);
    expect(result.skipped).toEqual([keyPoints[0]]);
  });

  it("treats a covered point with no evidence as skipped", () => {
    const result = validateCoverage(
      { items: [{ point: keyPoints[1], status: "covered", evidence: "" }] },
      keyPoints,
      TRANSCRIPT,
    );
    expect(result.covered).toEqual([]);
    expect(result.skipped).toEqual([keyPoints[1]]);
  });

  it("degrades to empty rather than throwing on a malformed response", () => {
    expect(validateCoverage("not json at all", keyPoints)).toEqual({
      covered: [],
      skipped: [],
      invented: [],
    });
  });
});
