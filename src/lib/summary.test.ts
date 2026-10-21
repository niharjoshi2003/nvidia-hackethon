import { describe, expect, it } from "vitest";
import { locatePoints, plainVerdict } from "./summary";
import type { CombinedPart, CombinedPoint, Quality } from "@/types";

const part = (status: CombinedPart["status"]): CombinedPart => ({
  part: "p",
  status,
  nano: null,
  ultra: null,
});

const point = (id: string, quote: string, quality: Quality | null, disputed = false): CombinedPoint => ({
  point: { id, quote },
  relevance: "on-question",
  quality,
  rubricLine: null,
  disputed,
  nano: null,
  ultra: null,
});

describe("plainVerdict", () => {
  it("says both things when every part was addressed but the points were weak", () => {
    const v = plainVerdict({
      parts: [part("addressed"), part("addressed")],
      points: [point("p1", "a", "vague"), point("p2", "b", "wrong"), point("p3", "c", "correct")],
    });
    expect(v.sentence).toBe(
      "You spoke to every part of the question, but most of your points were vague or wrong (2 of 3).",
    );
    expect(v.note).toBe("");
  });

  it("credits strong points when parts were addressed", () => {
    const v = plainVerdict({
      parts: [part("addressed")],
      points: [point("p1", "a", "justified"), point("p2", "b", "correct"), point("p3", "c", "vague")],
    });
    expect(v.sentence).toBe(
      "You spoke to every part of the question, and 2 of your 3 points were correct or justified.",
    );
  });

  it("reports partly addressed questions and disputed points", () => {
    const v = plainVerdict({
      parts: [part("addressed"), part("not-addressed")],
      points: [point("p1", "a", "correct"), point("p2", "b", null, true)],
    });
    expect(v.sentence).toBe("You spoke to 1 of 2 parts of the question, and 1 of your 2 points were correct or justified.");
    expect(v.note).toBe("The two models disagreed on 1 point; those are not credited.");
  });

  it("does not claim the question was answered when no part was addressed", () => {
    const v = plainVerdict({ parts: [part("not-addressed")], points: [] });
    expect(v.sentence).toBe("You did not directly answer the question yet.");
  });
});

describe("locatePoints", () => {
  const transcript = "I would chunk by headings. Then I run hybrid search, because names fail in vectors.";

  it("splits the transcript around rated points, keeping every word", () => {
    const a = point("p1", "chunk by headings", "correct");
    const b = point("p2", "Hybrid  search, because names fail", "justified");
    const { segments, unplaced } = locatePoints(transcript, [b, a]);
    expect(unplaced).toEqual([]);
    expect(segments.map((s) => s.text).join("")).toBe(transcript);
    expect(segments.filter((s) => s.point).map((s) => s.point!.point.id)).toEqual(["p1", "p2"]);
  });

  it("returns points it cannot find instead of guessing", () => {
    const ghost = point("p9", "something never said", "vague");
    const { segments, unplaced } = locatePoints(transcript, [ghost]);
    expect(unplaced).toHaveLength(1);
    expect(segments).toEqual([{ text: transcript }]);
  });

  it("does not highlight the same words twice", () => {
    const a = point("p1", "hybrid search", "correct");
    const b = point("p2", "hybrid search", "vague");
    const { unplaced } = locatePoints(transcript, [a, b]);
    expect(unplaced.map((p) => p.point.id)).toEqual(["p2"]);
  });
});
