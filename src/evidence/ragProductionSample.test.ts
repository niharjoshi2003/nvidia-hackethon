import { describe, expect, it } from "vitest";
import { buildCoachBrief } from "@/lib/coachBrief";
import { analyse } from "@/lib/analysis";
import { SHARED_CLAIMS } from "@/data/topics/sharedClaims";
import {
  BEST_QUOTE,
  UNRECORDED_QUOTE,
  WEAKEST_QUOTE,
  ragProductionOutcome,
  ragProductionTopic,
} from "./ragProductionSample";

describe("saved production RAG sample", () => {
  const topic = ragProductionTopic();
  const outcome = ragProductionOutcome();
  const analysis = analyse(topic, outcome);
  const brief = buildCoachBrief(topic, outcome);

  it("matches the sample the candidate saved", () => {
    expect(analysis.consensus.headline).toBe("Developing (split decision)");
    expect(analysis.consensus.explanation).toContain("Ultra says solid (64)");
    expect(analysis.consensus.explanation).toContain("Nano says developing (45)");

    const nano = analysis.verdicts.find((v) => v.grader === "nano");
    const ultra = analysis.verdicts.find((v) => v.grader === "ultra");
    expect(nano?.score).toBe(45);
    expect(nano?.band).toBe("developing");
    expect(ultra?.score).toBe(64);
    expect(ultra?.band).toBe("solid");

    expect(nano?.parameters.map((p) => [p.id, p.score, p.detail])).toEqual([
      ["parts", 100, "2 of 2 parts addressed"],
      ["points", 17, "9 points rated"],
      ["keyPoints", 0, "0 of 6 key points supported"],
      ["skills", 0, "average level 1.0 of 4 across 2 skills"],
    ]);
    expect(ultra?.parameters.find((p) => p.id === "points")).toMatchObject({
      score: null,
      detail: "0 points rated",
    });
    expect(ultra?.parameters.find((p) => p.id === "skills")?.detail).toBe(
      "average level 2.0 of 4 across 2 skills",
    );

    expect(nano?.qualityMix).toEqual({ justified: 0, correct: 0, vague: 9, wrong: 0 });
    expect(nano?.strongest?.point.quote).toBe(BEST_QUOTE);
    expect(nano?.weakest?.point.quote).toBe(WEAKEST_QUOTE);
    expect(nano?.gap?.plainLanguage).toMatch(/split documents into chunks/);
    expect(ultra?.gap?.rubricLine).toBe(SHARED_CLAIMS.retrievalEval);
    expect(ultra?.gap?.plainLanguage).toMatch(/trace the answer path/);

    expect(brief.verdict).toBe("You answered every part of the question.");
    expect(brief.groups.map((g) => [g.landed, g.highlights])).toEqual([
      [true, []],
      [true, []],
    ]);
    expect(brief.hasCollapsedNoise).toBe(true);
    expect(brief.sayNext).toBe(SHARED_CLAIMS.retrievalEval);
    expect(outcome.points.filter((p) => p.point.quote === UNRECORDED_QUOTE)).toHaveLength(7);
  });
});
