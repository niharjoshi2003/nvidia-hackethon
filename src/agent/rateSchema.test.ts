import { describe, expect, it } from "vitest";
import {
  combineParts,
  combinePoints,
  combineSkills,
  gateExtraction,
  gateRating,
  justifiedLines,
  nextLevel,
  pickGap,
  type RateContext,
} from "./rateSchema";
import type { ModelRating, PointRating, SkillRubric } from "@/types";

const TRANSCRIPT =
  "so I would split ingestion from query and I run keyword and vector search because names fail in vector search then a reranker cuts the list to eight and if answers are wrong I would change the prompt";

const KEY = [
  "Lexical and vector search both run because names and paraphrases fail in different ways",
  "Retrieval is evaluated separately from generation because a single end-to-end score hides which half failed",
];
const [HYBRID, EVAL] = KEY as [string, string];
const PARTS = ["Walk through the architecture", "Say where you would look if answers were wrong"];
const SKILLS: SkillRubric[] = [
  { name: "Architecture", levels: ["one", "two", "three", "four"] },
  { name: "Debugging", levels: ["d1", "d2", "d3", "d4"] },
];

const POINTS = gateExtraction(
  {
    points: [
      { quote: "I would split ingestion from query" },
      { quote: "I run keyword and vector search because names fail in vector search" },
      { quote: "if answers are wrong I would change the prompt" },
    ],
  },
  TRANSCRIPT,
);

const ctx: RateContext = { transcript: TRANSCRIPT, points: POINTS, parts: PARTS, keyPoints: KEY, skills: SKILLS };

const gap = {
  rubricLine: EVAL,
  quote: "I would change the prompt",
  category: "missing-mechanism",
  missType: "no retrieval check",
  plainLanguage: "You would change the prompt but never measure retrieval on its own.",
};

describe("gateExtraction", () => {
  it("keeps exact fragments, numbered in the order spoken", () => {
    const points = gateExtraction(
      { points: [{ quote: "a reranker cuts the list to eight" }, { quote: "I would split ingestion from query" }] },
      TRANSCRIPT,
    );
    expect(points).toEqual([
      { id: "p1", quote: "I would split ingestion from query" },
      { id: "p2", quote: "a reranker cuts the list to eight" },
    ]);
  });

  it("drops fragments that were never said, are too short, or overlap a kept one", () => {
    const points = gateExtraction(
      {
        points: [
          "I run keyword and vector search",
          "keyword and vector search because names fail",
          "we use a graph database",
          "so I",
        ],
      },
      TRANSCRIPT,
    );
    expect(points.map((p) => p.quote)).toEqual(["I run keyword and vector search"]);
  });

  it("returns nothing for an unparseable response", () => {
    expect(gateExtraction("not json", TRANSCRIPT)).toEqual([]);
  });
});

describe("gateRating", () => {
  it("keeps a valid rating and canonicalises the rubric line", () => {
    const rated = gateRating(
      {
        parts: [{ part: PARTS[0], addressed: true, quote: "I would split ingestion from query" }],
        points: [{ id: "p2", relevance: "on-question", quality: "Justified", rubricLine: HYBRID.toUpperCase(), reason: "r" }],
        skills: [{ skill: "architecture", level: 3 }],
        gap: null,
      },
      ctx,
    );
    expect(rated?.points.p2).toMatchObject({ quality: "justified", rubricLine: HYBRID });
    expect(rated?.skills).toEqual([{ skill: "Architecture", level: 3 }]);
    expect(rated?.parts[0]).toMatchObject({ addressed: true });
  });

  it("marks a part not addressed when its quote was never said, and fills omitted parts", () => {
    const rated = gateRating(
      { parts: [{ part: PARTS[0], addressed: "yes", quote: "I would use a knowledge graph" }] },
      ctx,
    );
    expect(rated?.parts).toEqual([
      { part: PARTS[0], addressed: false, quote: null },
      { part: PARTS[1], addressed: false, quote: null },
    ]);
  });

  it("drops points with unknown ids or labels outside the closed sets", () => {
    const rated = gateRating(
      {
        points: [
          { id: "p9", relevance: "on-question", quality: "correct" },
          { id: "p1", relevance: "on-question", quality: "excellent" },
          { id: "p2", relevance: "somewhat", quality: "correct" },
        ],
      },
      ctx,
    );
    expect(rated?.points).toEqual({});
  });

  it("drops an invented rubric line but keeps the point", () => {
    const rated = gateRating(
      { points: [{ id: "p1", relevance: "on-question", quality: "correct", rubricLine: "Use a vector database" }] },
      ctx,
    );
    expect(rated?.points.p1?.rubricLine).toBeNull();
  });

  it("drops levels outside 1 to 4 and unknown skills", () => {
    const rated = gateRating(
      { skills: [{ skill: "Architecture", level: 5 }, { skill: "Charisma", level: 2 }, { skill: "Debugging", level: "2" }] },
      ctx,
    );
    expect(rated?.skills).toEqual([{ skill: "Debugging", level: 2 }]);
  });

  it("keeps a gap that passes the citation gate", () => {
    expect(gateRating({ gap }, ctx)?.gap?.rubricLine).toBe(EVAL);
  });

  it("drops a gap whose quote was never said", () => {
    expect(gateRating({ gap: { ...gap, quote: "I would rebuild the index" } }, ctx)?.gap).toBeNull();
  });

  it("drops a gap that the same model's credited point supports", () => {
    const rated = gateRating(
      {
        points: [{ id: "p3", relevance: "on-question", quality: "correct", rubricLine: EVAL, reason: "r" }],
        gap,
      },
      ctx,
    );
    expect(rated?.gap).toBeNull();
  });

  it("returns null for a response that is not an object", () => {
    expect(gateRating("nope", ctx)).toBeNull();
  });
});

// --- combine ----------------------------------------------------------------

const point = (id: string, patch: Partial<PointRating> = {}): PointRating => ({
  id,
  relevance: "on-question",
  quality: "correct",
  rubricLine: null,
  reason: "",
  ...patch,
});

const rating = (patch: Partial<ModelRating> = {}): ModelRating => ({
  parts: PARTS.map((part) => ({ part, addressed: true, quote: "x" })),
  points: {},
  skills: [],
  gap: null,
  ...patch,
});

describe("combineParts", () => {
  it("agrees, disagrees, and falls back to one model", () => {
    const nano = rating();
    const ultra = rating({
      parts: [
        { part: PARTS[0]!, addressed: true, quote: "x" },
        { part: PARTS[1]!, addressed: false, quote: null },
      ],
    });
    expect(combineParts(PARTS, nano, ultra).map((p) => p.status)).toEqual(["addressed", "disputed"]);
    expect(combineParts(PARTS, null, ultra).map((p) => p.status)).toEqual(["addressed", "not-addressed"]);
  });
});

describe("combinePoints", () => {
  it("sets labels only when both models agree, and disputes a different quality", () => {
    const nano = rating({ points: { p1: point("p1"), p2: point("p2", { quality: "justified" }) } });
    const ultra = rating({ points: { p1: point("p1"), p2: point("p2", { quality: "vague" }) } });
    const [p1, p2] = combinePoints(POINTS, nano, ultra);
    expect(p1).toMatchObject({ quality: "correct", relevance: "on-question", disputed: false });
    expect(p2).toMatchObject({ quality: null, disputed: true });
  });

  it("leaves a differing rubric line unset without disputing the point", () => {
    const nano = rating({ points: { p2: point("p2", { rubricLine: HYBRID }) } });
    const ultra = rating({ points: { p2: point("p2") } });
    expect(combinePoints(POINTS, nano, ultra)[1]).toMatchObject({ rubricLine: null, disputed: false });
  });

  it("uses the only rating when one model failed", () => {
    const ultra = rating({ points: { p1: point("p1", { quality: "wrong" }) } });
    expect(combinePoints(POINTS, null, ultra)[0]).toMatchObject({ quality: "wrong", disputed: false });
  });
});

describe("combineSkills and nextLevel", () => {
  it("keeps both levels and points at the level above the lower one", () => {
    const [arch] = combineSkills(
      SKILLS,
      rating({ skills: [{ skill: "Architecture", level: 2 }] }),
      rating({ skills: [{ skill: "Architecture", level: 3 }] }),
    );
    expect(arch).toMatchObject({ nano: 2, ultra: 3 });
    expect(nextLevel(arch!)).toEqual({ level: 3, text: "three" });
  });

  it("has no next level at the top", () => {
    expect(nextLevel({ skill: SKILLS[0]!, nano: 4, ultra: 4 })).toBeNull();
  });
});

describe("pickGap", () => {
  const g = { ...gap, category: "missing-mechanism" as const };

  it("shows a gap only when both models name the same line", () => {
    const points = combinePoints(POINTS, rating(), rating());
    expect(pickGap(points, rating({ gap: g }), rating({ gap: g }))?.from).toBe("ultra");
    expect(pickGap(points, rating({ gap: g }), rating({ gap: { ...g, rubricLine: HYBRID } }))).toBeNull();
    expect(pickGap(points, rating({ gap: g }), rating())).toBeNull();
  });

  it("lets the only model's gap stand when the other failed", () => {
    const points = combinePoints(POINTS, null, rating());
    expect(pickGap(points, rating({ gap: g }), null)?.from).toBe("nano");
  });

  it("never names a line an agreed credited point supports", () => {
    const supported = { p3: point("p3", { rubricLine: EVAL }) };
    const nano = rating({ points: supported, gap: g });
    const ultra = rating({ points: supported, gap: g });
    expect(pickGap(combinePoints(POINTS, nano, ultra), nano, ultra)).toBeNull();
  });
});

describe("justifiedLines", () => {
  it("counts only agreed, justified, on-question points with a rubric line", () => {
    const both = { p2: point("p2", { quality: "justified", rubricLine: HYBRID }), p1: point("p1", { rubricLine: EVAL }) };
    expect(justifiedLines(combinePoints(POINTS, rating({ points: both }), rating({ points: both })))).toEqual([HYBRID]);

    const related = { p2: point("p2", { quality: "justified", rubricLine: HYBRID, relevance: "related" }) };
    expect(justifiedLines(combinePoints(POINTS, rating({ points: related }), rating({ points: related })))).toEqual([]);
  });
});
