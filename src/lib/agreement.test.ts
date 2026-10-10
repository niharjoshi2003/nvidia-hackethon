import { describe, expect, it } from "vitest";
import { emptyCounts, fromCombined, interRater, scoreAnswer } from "./agreement";
import type { CombinedLine } from "@/types";

describe("scoreAnswer", () => {
  it("counts line agreement, answer agreement, and false misses", () => {
    const labels = { L1: "covered", L2: "missed" } as const;
    const all = scoreAnswer(emptyCounts(), labels, (l) => labels[l as "L1" | "L2"]);
    expect(all).toMatchObject({ answersAgree: 1, answers: 1, linesAgree: 2, lines: 2, falseMisses: 0 });

    const wrong = scoreAnswer(emptyCounts(), labels, () => "missed");
    expect(wrong).toMatchObject({ answersAgree: 0, linesAgree: 1, falseMisses: 1 });
  });

  it("counts a disputed line as an abstention, not an agreement", () => {
    const lines: CombinedLine[] = [{ line: "L1", status: "disputed", nano: null, ultra: null }];
    const counts = scoreAnswer(emptyCounts(), { L1: "covered" }, fromCombined(lines));
    expect(counts).toMatchObject({ abstained: 1, linesAgree: 0, answersAgree: 0 });
  });
});

describe("interRater", () => {
  it("measures human against human", () => {
    const counts = interRater([
      { a: { L1: "covered" }, b: { L1: "covered" } },
      { a: { L1: "covered" }, b: { L1: "missed" } },
    ]);
    expect(counts).toMatchObject({ answersAgree: 1, answers: 2 });
  });
});
