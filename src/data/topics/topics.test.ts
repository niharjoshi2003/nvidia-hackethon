import { describe, expect, it } from "vitest";
import { seedTopics } from "./index";
import { rubricLines } from "@/types";
import { normalize } from "@/lib/text";

/**
 * These guard the rubric quality the whole product depends on.
 *
 * The citation gate canonicalises a cited line by finding the first supplied
 * line that normalises equal to it. If a topic contained the same line twice,
 * or two lines that differ only in whitespace, that lookup would be ambiguous
 * and a miss could be attributed to the wrong rubric entry. These tests make
 * that impossible to introduce by accident.
 */
describe("seed topic rubrics", () => {
  it("has a unique id for every topic", () => {
    const ids = seedTopics.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(seedTopics.map((t) => [t.id, t] as const))(
    "%s has rubric lines that are unique after normalisation",
    (_id, topic) => {
      const lines = rubricLines(topic).map(normalize);
      expect(new Set(lines).size).toBe(lines.length);
    },
  );

  it.each(seedTopics.map((t) => [t.id, t] as const))(
    "%s has enough rubric detail to produce a specific miss",
    (_id, topic) => {
      expect(topic.scaffold.keyPoints.length).toBeGreaterThanOrEqual(5);
      expect(topic.scaffold.commonGotchas.length).toBeGreaterThanOrEqual(2);
      expect(topic.modelAnswer.length).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(seedTopics.map((t) => [t.id, t] as const))(
    "%s has rubric lines specific enough to quote back to a learner",
    (_id, topic) => {
      for (const line of rubricLines(topic)) {
        // A line the evaluator must copy verbatim has to read as a full claim.
        // Short fragments like "error handling" produce exactly the vague miss
        // this project exists to avoid.
        expect(line.trim().split(/\s+/).length).toBeGreaterThanOrEqual(6);
        expect(line).not.toMatch(/\.$/);
      }
    },
  );

  it("covers every track", () => {
    expect(new Set(seedTopics.map((t) => t.track)).size).toBe(4);
  });
});
