/**
 * Prompt construction for the two-stage grade.
 *
 * Built from structured input on the server rather than accepting messages
 * from the browser. That is a deliberate constraint: the endpoint can only ever
 * grade an answer against a rubric, so a leaked URL cannot be used as a general
 * purpose model proxy on the project's credits.
 *
 * Both prompts push the model toward copying rather than composing. Every
 * instruction here has a matching check in gradeSchema.ts — the prompt asks,
 * the gate enforces, and the gate is the one that decides.
 */

import { MISS_CATEGORIES } from "@/types";

export interface GradeRequest {
  transcript: string;
  keyPoints: string[];
  gotchas: string[];
  modelAnswerLines: string[];
}

const bullet = (lines: string[]) => lines.map((l) => `- ${l}`).join("\n");

// --- stage 1: coverage ------------------------------------------------------

export const COVERAGE_SYSTEM = [
  "You classify which rubric key points a spoken answer covered.",
  "",
  "Return JSON with exactly two fields: covered and skipped, both arrays of strings.",
  "Every string MUST be copied character-for-character from the supplied key points.",
  "Do not invent points, merge points, rewrite them, or add commentary.",
  "A point counts as covered only if the speaker addressed its substance, not merely a related word.",
  "Every supplied key point must appear in exactly one of the two arrays.",
].join("\n");

export function coverageUser(req: GradeRequest): string {
  return [
    "KEY POINTS:",
    bullet(req.keyPoints),
    "",
    "TRANSCRIPT OF THE SPOKEN ANSWER:",
    req.transcript,
    "",
    'Return JSON: {"covered": string[], "skipped": string[]}',
  ].join("\n");
}

// --- stage 2: judgment ------------------------------------------------------

export const JUDGMENT_SYSTEM = [
  "You name the single most important thing a spoken answer missed.",
  "",
  "Rules, all mandatory:",
  "- quote MUST be copied character-for-character from the transcript. Never paraphrase it.",
  "- quote must be a fragment the speaker actually said, ideally the part closest to the gap.",
  "- rubricLine MUST be copied character-for-character from the supplied rubric lines.",
  "  Do not reword, shorten, merge, or improve it. A reworded line is rejected.",
  `- category MUST be exactly one of: ${MISS_CATEGORIES.join(", ")}`,
  "- missType is your own short label, at most six words, naming the specific gap.",
  "- plainLanguage is one or two sentences addressed to the speaker, describing what",
  "  they said and what was missing. No study tips, no encouragement, no preamble.",
  "",
  "Choose the miss that would most change an interviewer's judgment of this answer.",
  "Prefer a substantive omission over a presentation issue.",
  "If the answer genuinely covered everything, pick the rubric line it handled most",
  "weakly and say so plainly in plainLanguage.",
].join("\n");

export function judgmentUser(req: GradeRequest, skipped: string[]): string {
  const sections = [
    "RUBRIC — you may cite any line below, copied exactly:",
    "",
    "Key points:",
    bullet(req.keyPoints),
    "",
    "Common gotchas:",
    bullet(req.gotchas),
    "",
    "Lines a strong answer would contain:",
    bullet(req.modelAnswerLines),
  ];

  if (skipped.length > 0) {
    sections.push(
      "",
      "A first pass judged these key points NOT covered. Treat this as a hint, not",
      "as fact; verify against the transcript before citing one.",
      bullet(skipped),
    );
  }

  sections.push(
    "",
    "TRANSCRIPT OF THE SPOKEN ANSWER:",
    req.transcript,
    "",
    "Return JSON:",
    '{"missType": string, "category": string, "quote": string, "rubricLine": string,',
    ' "plainLanguage": string, "coveredRubricLines": string[]}',
  );

  return sections.join("\n");
}

/**
 * Every line the evaluator is permitted to cite, in the same order they were
 * shown. The gate is handed exactly this array, so a line that was never in
 * the prompt can never survive validation.
 */
export function suppliedLines(req: GradeRequest): string[] {
  return [...req.keyPoints, ...req.gotchas, ...req.modelAnswerLines];
}
