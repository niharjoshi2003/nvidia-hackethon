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
  "Return JSON with one field, items: one entry per supplied key point.",
  "Each entry has point, status, and evidence.",
  "point MUST be copied character-for-character from the supplied key points.",
  'status is exactly "covered" or "skipped".',
  "When status is covered, evidence MUST be a short fragment copied",
  "character-for-character from the transcript — the words where the speaker",
  "states that point. When status is skipped, evidence is an empty string.",
  "The speaker will paraphrase. A point is covered only when the transcript",
  "states that point's own idea. A neighbouring point being covered is not",
  "enough, and a related word is not enough.",
  "Do not invent points, merge points, or rewrite them.",
  "Every supplied key point appears exactly once.",
].join("\n");

export function coverageUser(req: GradeRequest): string {
  return [
    "KEY POINTS:",
    bullet(req.keyPoints),
    "",
    "TRANSCRIPT OF THE SPOKEN ANSWER:",
    req.transcript,
    "",
    'Return JSON: {"items":[{"point": string, "status": "covered" | "skipped", "evidence": string}]}',
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
  "",
  "If the answer covered the substance of every rubric line, do not invent a miss.",
  'Return {"noMiss": true, "coveredRubricLines": string[]} instead. Inventing a flaw in a',
  "complete answer is the worst error you can make here.",
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
    "Return JSON, either:",
    '{"missType": string, "category": string, "quote": string, "rubricLine": string,',
    ' "plainLanguage": string, "coveredRubricLines": string[]}',
    "or, only when nothing substantive was missed:",
    '{"noMiss": true, "coveredRubricLines": string[]}',
  );

  return sections.join("\n");
}

// --- parallel: per-line verdicts --------------------------------------------

/** Nano and Ultra both receive exactly this prompt. */
export const LINES_SYSTEM = [
  "You grade a spoken interview answer against rubric key points, one verdict per point.",
  "",
  "Rules, all mandatory:",
  "- line MUST be copied character-for-character from the supplied key points.",
  '- status is exactly "covered" or "missed".',
  "- When covered, quote MUST be a short fragment copied character-for-character from the",
  "  transcript where the speaker states that point. A paraphrase in your own words is rejected.",
  "- When missed, quote is an empty string.",
  "- A point is covered only when the transcript states that point's own idea. A related word",
  "  or a neighbouring point is not enough.",
  "- Every supplied key point appears exactly once.",
  "",
  "Also name the single most important missed point as headline, or null if none was missed:",
  "- headline.rubricLine MUST be one of the key points you marked missed, copied exactly.",
  "- headline.quote MUST be copied from the transcript: the fragment closest to the gap.",
  `- headline.category MUST be exactly one of: ${MISS_CATEGORIES.join(", ")}`,
  "- headline.missType is at most six words. headline.plainLanguage is one or two sentences",
  "  addressed to the speaker: what they said and what was missing.",
].join("\n");

export function linesUser(req: Pick<GradeRequest, "transcript" | "keyPoints">): string {
  return [
    "KEY POINTS:",
    bullet(req.keyPoints),
    "",
    "TRANSCRIPT OF THE SPOKEN ANSWER:",
    req.transcript,
    "",
    'Return JSON: {"lines":[{"line": string, "status": "covered" | "missed", "quote": string}],',
    ' "headline": {"rubricLine": string, "quote": string, "category": string, "missType": string,',
    ' "plainLanguage": string} | null}',
  ].join("\n");
}

// --- rated answer: extract points -------------------------------------------

export interface RateRequest {
  question: string;
  transcript: string;
  parts: string[];
  keyPoints: string[];
  skills: { name: string; levels: string[] }[];
}

/**
 * Speech recognition returns almost no punctuation, so points cannot be split
 * in code. One call splits them; the gate keeps only exact fragments.
 */
export const EXTRACT_SYSTEM = [
  "You split a spoken interview answer into the separate points the speaker made.",
  "",
  "Rules, all mandatory:",
  "- Each point is one claim, decision, or step, together with any reason the speaker gave for it.",
  "- quote MUST be copied character-for-character from the transcript. Do not fix grammar,",
  "  add punctuation, or join words that are not next to each other.",
  "- Keep the reason with its claim: \"hybrid search because names fail in vector search\" is one point.",
  "- Skip filler such as \"so\", \"um\", \"I think that's it\".",
  "- Points do not overlap, and they appear in the order spoken. At most 12 points.",
].join("\n");

export function extractUser(req: Pick<RateRequest, "transcript">): string {
  return [
    "TRANSCRIPT OF THE SPOKEN ANSWER:",
    req.transcript,
    "",
    'Return JSON: {"points":[{"quote": string}]}',
  ].join("\n");
}

// --- rated answer: rate -----------------------------------------------------

/** Nano and Ultra both receive exactly this prompt. */
export const RATE_SYSTEM = [
  "You rate a spoken interview answer the way a fair, demanding interviewer would.",
  "You rate what the candidate said. Do not give credit for what they might have meant.",
  "",
  "parts: one entry per supplied question part, part copied exactly.",
  "- addressed is true only when the candidate speaks to that part.",
  "- When addressed, quote MUST be copied character-for-character from the transcript. Otherwise quote is \"\".",
  "",
  "points: one entry per supplied point id.",
  `- relevance is exactly one of: on-question (answers what was asked), related (true and nearby,`,
  "  but not what was asked), off-topic.",
  "- quality is exactly one of:",
  "  wrong: inaccurate, or would fail in production.",
  "  vague: names an idea without saying what it does or how.",
  "  correct: states the idea accurately.",
  "  justified: correct AND the candidate gives the reason or tradeoff in their own words.",
  "  A reason you can imagine but the candidate did not say does not make a point justified.",
  "- rubricLine is the key point this point supports, copied exactly, or null. A point supports a",
  "  key point only when it states that key point's own idea. A related word is not enough.",
  "- reason is one sentence, at most 25 words, addressed to the candidate, saying why this label.",
  "",
  "skills: one entry per supplied skill, skill copied exactly. level is 1, 2, 3, or 4: the written",
  "level that best describes the whole answer. Between two levels, pick the lower.",
  "",
  "gap: the single key point that would most change an interviewer's judgment and that none of",
  "your correct or justified points supports. null when every key point is supported.",
  "- gap.rubricLine MUST be copied exactly from the key points.",
  "- gap.quote MUST be copied from the transcript: the words closest to the gap.",
  `- gap.category MUST be exactly one of: ${MISS_CATEGORIES.join(", ")}`,
  "- gap.missType is at most six words. gap.plainLanguage is one or two sentences addressed to the",
  "  candidate: what they said and what was missing. No encouragement, no study tips.",
].join("\n");

export function rateUser(req: RateRequest, points: { id: string; quote: string }[]): string {
  const skills = req.skills.flatMap((skill) => [
    `- ${skill.name}`,
    ...skill.levels.map((level, i) => `    ${i + 1}: ${level}`),
  ]);
  return [
    "QUESTION:",
    req.question,
    "",
    "QUESTION PARTS:",
    bullet(req.parts),
    "",
    "KEY POINTS:",
    bullet(req.keyPoints),
    "",
    "SKILLS AND LEVELS:",
    ...skills,
    "",
    "CANDIDATE'S POINTS, quoted from the transcript:",
    ...points.map((p) => `${p.id}: "${p.quote}"`),
    "",
    "FULL TRANSCRIPT:",
    req.transcript,
    "",
    "Return JSON:",
    '{"parts":[{"part": string, "addressed": boolean, "quote": string}],',
    ' "points":[{"id": string, "relevance": string, "quality": string, "rubricLine": string | null, "reason": string}],',
    ' "skills":[{"skill": string, "level": number}],',
    ' "gap": {"rubricLine": string, "quote": string, "category": string, "missType": string, "plainLanguage": string} | null}',
  ].join("\n");
}

// --- repaired answer --------------------------------------------------------

export const REPAIR_SYSTEM = [
  "You repair a candidate's spoken interview answer by adding only what it missed.",
  "",
  "Rules, all mandatory:",
  "- Keep the candidate's own sentences, copied exactly, in their original order.",
  "- Add the fewest sentences needed to cover each missed point, in the candidate's voice.",
  "- Every sentence you add MUST carry rubricLine: the missed point it covers, copied exactly.",
  "- Sentences copied from the candidate carry rubricLine: null.",
  "- Do not add anything that is not one of the missed points. Untagged additions are deleted.",
].join("\n");

export function repairUser(req: { transcript: string; missedLines: string[] }): string {
  return [
    "MISSED POINTS:",
    bullet(req.missedLines),
    "",
    "CANDIDATE'S ANSWER:",
    req.transcript,
    "",
    'Return JSON: {"sentences":[{"text": string, "rubricLine": string | null}]}',
  ].join("\n");
}

/**
 * Every line the evaluator is permitted to cite, in the same order they were
 * shown. The gate is handed exactly this array, so a line that was never in
 * the prompt can never survive validation.
 */
export function suppliedLines(req: GradeRequest): string[] {
  return [...req.keyPoints, ...req.gotchas, ...req.modelAnswerLines];
}
