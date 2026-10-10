import { describe, expect, it } from "vitest";
import { analyse, bandFor, compareModels, consensus, modelVerdict, type GradedOutcome } from "./analysis";
import { interviewTopics } from "@/data/topics/interview";
import type { CombinedPart, CombinedPoint, PointRating } from "@/types";

const rag = interviewTopics.find((t) => t.id === "rag-production-design")!;
const [KEY_A, KEY_B] = rag.scaffold.keyPoints as [string, string];

const rating = (id: string, quality: PointRating["quality"], rubricLine: string | null = null): PointRating => ({
  id,
  relevance: "on-question",
  quality,
  rubricLine,
  reason: `${quality} because`,
});

function outcome(points: CombinedPoint[], parts: CombinedPart[], extra: Partial<GradedOutcome> = {}): GradedOutcome {
  return {
    status: "graded",
    parts,
    points,
    skills: [],
    gap: null,
    supported: [],
    models: { extract: "nano", nano: "nano", ultra: "ultra" },
    partial: false,
    replay: false,
    calls: [],
    ...extra,
  };
}

const part = (name: string, nano: boolean, ultra: boolean): CombinedPart => ({
  part: name,
  status: nano === ultra ? (nano ? "addressed" : "not-addressed") : "disputed",
  nano: { part: name, addressed: nano, quote: nano ? "q" : null },
  ultra: { part: name, addressed: ultra, quote: ultra ? "q" : null },
});

const point = (id: string, nano: PointRating | null, ultra: PointRating | null): CombinedPoint => ({
  point: { id, quote: `quote ${id}` },
  relevance: nano && ultra && nano.relevance === ultra.relevance ? nano.relevance : null,
  quality: nano && ultra && nano.quality === ultra.quality ? nano.quality : null,
  rubricLine: nano && ultra && nano.rubricLine === ultra.rubricLine ? nano.rubricLine : null,
  disputed: !!nano && !!ultra && (nano.quality !== ultra.quality || nano.relevance !== ultra.relevance),
  nano,
  ultra,
});

describe("bandFor", () => {
  it("maps scores onto the four bands", () => {
    expect(bandFor(85)).toBe("strong");
    expect(bandFor(60)).toBe("solid");
    expect(bandFor(59)).toBe("developing");
    expect(bandFor(10)).toBe("not-yet");
  });
});

describe("modelVerdict", () => {
  it("scores each model only on its own ratings", () => {
    const o = outcome(
      [
        point("p1", rating("p1", "justified", KEY_A), rating("p1", "vague")),
        point("p2", rating("p2", "justified", KEY_B), rating("p2", "vague")),
      ],
      [part("A", true, false)],
    );
    const nano = modelVerdict(rag, o, "nano");
    const ultra = modelVerdict(rag, o, "ultra");
    expect(nano.score!).toBeGreaterThan(ultra.score!);
    expect(nano.parameters.find((p) => p.id === "parts")!.score).toBe(100);
    expect(ultra.parameters.find((p) => p.id === "parts")!.score).toBe(0);
    expect(nano.qualityMix.justified).toBe(2);
    expect(ultra.qualityMix.vague).toBe(2);
  });

  it("leaves out a parameter that does not apply", () => {
    const o = outcome([point("p1", rating("p1", "correct"), rating("p1", "correct"))], [part("A", true, true)]);
    const v = modelVerdict(rag, o, "nano");
    expect(v.parameters.find((p) => p.id === "skills")!.score).toBeNull();
    expect(v.score).not.toBeNull();
  });

  it("reports a model that did not answer", () => {
    const o = outcome([point("p1", rating("p1", "correct"), null)], [part("A", true, true)], {
      models: { extract: "nano", nano: "nano", ultra: null },
      partial: true,
    });
    const ultra = modelVerdict(rag, o, "ultra");
    expect(ultra.answered).toBe(false);
    expect(ultra.score).toBeNull();
  });
});

describe("consensus", () => {
  it("takes the stricter band on a split instead of averaging", () => {
    const o = outcome(
      [point("p1", rating("p1", "justified", KEY_A), rating("p1", "wrong"))],
      [part("A", true, false)],
    );
    const c = analyse(rag, o).consensus;
    expect(c.agreed).toBe(false);
    expect(c.band).toBe(modelVerdict(rag, o, "ultra").band);
    expect(c.headline).toMatch(/split/);
  });

  it("confirms when both land in the same band", () => {
    const o = outcome(
      [point("p1", rating("p1", "correct"), rating("p1", "correct"))],
      [part("A", true, true)],
    );
    expect(analyse(rag, o).consensus.agreed).toBe(true);
  });

  it("flags a single opinion", () => {
    const c = consensus([
      { ...modelVerdict(rag, outcome([], [part("A", true, true)]), "nano"), score: 70, band: "solid" },
      { ...modelVerdict(rag, outcome([], [part("A", true, true)]), "ultra"), score: null, band: null },
    ]);
    expect(c.single).toBe(true);
    expect(c.band).toBe("solid");
  });
});

describe("compareModels", () => {
  it("counts agreement per decision and names the stricter model", () => {
    const o = outcome(
      [
        point("p1", rating("p1", "justified"), rating("p1", "vague")),
        point("p2", rating("p2", "correct"), rating("p2", "correct")),
      ],
      [part("A", true, true), part("B", true, false)],
      { gaps: { nano: null, ultra: null } },
    );
    const c = compareModels(o);
    expect(c.rows.find((r) => r.id === "quality")).toMatchObject({ agree: 1, total: 2 });
    expect(c.rows.find((r) => r.id === "parts")).toMatchObject({ agree: 1, total: 2 });
    expect(c.rows.find((r) => r.id === "gap")).toMatchObject({ agree: 1, total: 1 });
    expect(c.stricter?.grader).toBe("ultra");
    expect(c.splits.map((p) => p.point.id)).toEqual(["p1"]);
  });
});
