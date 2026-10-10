import { describe, expect, it } from "vitest";
import { buildCoachBrief, partLanded, rubricLinePartIndex } from "./coachBrief";
import { interviewTopics } from "@/data/topics/interview";
import type { CombinedPart, CombinedPoint, RatedOutcome } from "@/types";

const rag = interviewTopics.find((t) => t.id === "rag-production-design")!;

const HYBRID =
  "Lexical and vector search both run because names and paraphrases fail in different ways";
const EVAL =
  "Retrieval is evaluated separately from generation because a single end-to-end score hides which half failed";

function graded(
  parts: CombinedPart[],
  points: CombinedPoint[],
  gap: Extract<RatedOutcome, { status: "graded" }>["gap"] = null,
): Extract<RatedOutcome, { status: "graded" }> {
  return {
    status: "graded",
    parts,
    points,
    skills: [],
    gap,
    supported: [],
    models: { extract: "nano", nano: "nano", ultra: "ultra" },
    partial: false,
    replay: false,
    calls: [],
  };
}

/** Shape similar to the user's disputed RAG session. */
describe("buildCoachBrief on disputed RAG-shaped outcome", () => {
  const parts: CombinedPart[] = [
    {
      part: "Walk through the architecture of the RAG system",
      status: "addressed",
      nano: { part: "Walk through the architecture of the RAG system", addressed: true, quote: "optimize the query" },
      ultra: { part: "Walk through the architecture of the RAG system", addressed: true, quote: "optimize the query" },
    },
    {
      part: "Say where you would look if the answers were wrong",
      status: "disputed",
      nano: { part: "Say where you would look if the answers were wrong", addressed: true, quote: "embedding models" },
      ultra: {
        part: "Say where you would look if the answers were wrong",
        addressed: false,
        quote: "embedding models",
      },
    },
  ];

  const points: CombinedPoint[] = [
    {
      point: { id: "p1", quote: "we will optimize the query which is user by the which is used by the user" },
      relevance: "related",
      quality: "vague",
      rubricLine: null,
      disputed: false,
      nano: null,
      ultra: null,
    },
    {
      point: { id: "p2", quote: "then embedded it to the vector database" },
      relevance: "related",
      quality: "vague",
      rubricLine: null,
      disputed: false,
      nano: null,
      ultra: null,
    },
    {
      point: {
        id: "p3",
        quote: "the main retrieval will be BM 25 + 5 and then rerank the query and then eventually context will go down to LLM",
      },
      relevance: "on-question",
      quality: "correct",
      rubricLine: HYBRID,
      disputed: false,
      nano: null,
      ultra: null,
    },
    {
      point: { id: "p4", quote: "different embedding models which we can use according to this" },
      relevance: "related",
      quality: "vague",
      rubricLine: null,
      disputed: true,
      nano: null,
      ultra: null,
    },
  ];

  it("marks debugging part as not landed when disputed", () => {
    expect(partLanded(parts[1]!)).toBe(false);
    const brief = buildCoachBrief(rag, graded(parts, points));
    expect(brief.groups[1]?.landed).toBe(false);
  });

  it("groups architecture highlights and collapses noise", () => {
    const brief = buildCoachBrief(rag, graded(parts, points));
    expect(brief.groups[0]?.highlights).toContain(points[2]!.point.quote);
    expect(brief.hasCollapsedNoise).toBe(true);
  });

  it("always gives a say-next line when gap is null", () => {
    const brief = buildCoachBrief(rag, graded(parts, points, null));
    expect(brief.sayNext.length).toBeGreaterThan(20);
    expect(brief.targetRubricLine).toBeTruthy();
    expect(brief.verdict).toMatch(/not/i);
  });

  it("prefers gap plain language when models agree on a gap", () => {
    const gap = {
      rubricLine: EVAL,
      quote: "different embedding models",
      missType: "no retrieval check",
      category: "missing-mechanism" as const,
      plainLanguage: "Read retrieved chunks before you change the prompt or the model.",
      from: "ultra" as const,
    };
    const brief = buildCoachBrief(rag, graded(parts, points, gap));
    expect(brief.sayNext).toBe(gap.plainLanguage);
    expect(brief.targetRubricLine).toBe(EVAL);
  });
});

describe("rubricLinePartIndex", () => {
  it("sends retrieval eval lines to the debugging part", () => {
    const idx = rubricLinePartIndex(rag, EVAL);
    expect(rag.parts![idx]).toMatch(/wrong/i);
  });
});
