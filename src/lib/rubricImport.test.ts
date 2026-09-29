import { describe, expect, it } from "vitest";
import { EXAMPLE_RUBRIC, parseRubricFile } from "./rubricImport";
import { rubricLines } from "@/types";

const valid = {
  title: "Handling a production incident call",
  track: "swe",
  framing: "You are the incident lead and the page just went off. What do you do first?",
  keyPoints: [
    "Establish a single incident lead so decisions are not made in parallel",
    "Mitigate the customer impact before investigating the underlying cause",
    "Post a status update on a fixed cadence even when nothing has changed",
  ],
  modelAnswer: ["The call opens by naming the lead and the current customer impact"],
};

describe("parseRubricFile", () => {
  it("accepts a well-formed rubric and marks it imported", () => {
    const result = parseRubricFile(JSON.stringify(valid));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [topic] = result.topics;
    expect(topic?.source).toBe("imported");
    expect(topic?.title).toBe(valid.title);
    expect(topic?.scaffold.keyPoints).toHaveLength(3);
  });

  it("accepts the example shown in the UI", () => {
    expect(parseRubricFile(EXAMPLE_RUBRIC).ok).toBe(true);
  });

  it("accepts an array of rubrics", () => {
    const result = parseRubricFile(
      JSON.stringify([valid, { ...valid, title: "A second scenario entirely" }]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.topics).toHaveLength(2);
    expect(new Set(result.topics.map((t) => t.id)).size).toBe(2);
  });

  it("rejects rubric lines too vague to produce a specific miss", () => {
    const result = parseRubricFile(
      JSON.stringify({ ...valid, keyPoints: ["error handling", "be clear", "use caching"] }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("words");
  });

  it("rejects a rubric that repeats a line, which would make citations ambiguous", () => {
    const line = valid.keyPoints[0]!;
    const result = parseRubricFile(
      JSON.stringify({ ...valid, modelAnswer: [line] }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("repeats");
  });

  it("rejects an unknown track", () => {
    const result = parseRubricFile(JSON.stringify({ ...valid, track: "cooking" }));
    expect(result.ok).toBe(false);
  });

  it("explains malformed JSON rather than throwing", () => {
    const result = parseRubricFile("{ not json");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("valid JSON");
  });

  it("does not collide with an existing topic id", () => {
    const first = parseRubricFile(JSON.stringify(valid));
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = parseRubricFile(JSON.stringify(valid), [first.topics[0]!.id]);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.topics[0]!.id).not.toBe(first.topics[0]!.id);
  });

  it("produces citable rubric lines the gate can match against", () => {
    const result = parseRubricFile(JSON.stringify(valid));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const lines = rubricLines(result.topics[0]!);
    expect(lines).toContain(valid.keyPoints[0]);
    expect(lines).toContain(valid.modelAnswer[0]);
  });
});
