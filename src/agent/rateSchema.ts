/**
 * Rated answers: extract the candidate's points, gate each model's rating of
 * them, and combine the two.
 *
 * The models rate; code decides what survives:
 *
 *   - a point is kept only if it is an exact fragment of the transcript,
 *   - a part counts as addressed only with a quote from the transcript,
 *   - labels must come from the closed sets, levels must be 1 to 4,
 *   - a rubric line or part must be one that was supplied,
 *   - a gap on a line the same model's own correct or justified point
 *     supports is a contradiction and is dropped.
 *
 * Server and browser both run gateExtraction on the same transcript, so both
 * number the same points. Disagreements are shown, never averaged.
 */

import { z } from "zod";
import {
  QUALITY,
  RELEVANCE,
  type AnswerPoint,
  type CombinedPart,
  type CombinedPoint,
  type CombinedSkill,
  type Gap,
  type GraderId,
  type ModelRating,
  type PartRating,
  type PointRating,
  type Quality,
  type Relevance,
  type SkillLevel,
  type SkillRating,
  type SkillRubric,
} from "@/types";
import { isQuotedFrom, normalize, wordCount } from "@/lib/text";
import { validateJudgment } from "./gradeSchema";

export const MAX_POINTS = 12;
const MIN_POINT_WORDS = 3;
const MAX_REASON_CHARS = 240;

// --- extract ----------------------------------------------------------------

const extractSchema = z.object({
  points: z
    .array(z.union([z.string(), z.object({ quote: z.string().optional().nullable() })]))
    .max(40),
});

/**
 * The candidate's points, in the order spoken. A fragment that was never said,
 * is too short to be a claim, or overlaps one already kept is dropped. Ids
 * are assigned after gating so they are the same wherever this runs.
 */
export function gateExtraction(raw: unknown, transcript: string): AnswerPoint[] {
  const parsed = extractSchema.safeParse(raw);
  if (!parsed.success) return [];

  const said = normalize(transcript);
  const spans: { quote: string; start: number; end: number }[] = [];

  for (const item of parsed.data.points) {
    const quote = (typeof item === "string" ? item : item.quote ?? "").trim();
    if (wordCount(quote) < MIN_POINT_WORDS || !isQuotedFrom(quote, transcript)) continue;
    const start = said.indexOf(normalize(quote));
    const end = start + normalize(quote).length;
    if (spans.some((s) => start < s.end && end > s.start)) continue;
    spans.push({ quote, start, end });
  }

  return spans
    .sort((a, b) => a.start - b.start)
    .slice(0, MAX_POINTS)
    .map((s, i) => ({ id: `p${i + 1}`, quote: s.quote }));
}

// --- rate -------------------------------------------------------------------

const rateSchema = z.object({
  parts: z
    .array(
      z.object({
        part: z.string(),
        addressed: z.union([z.boolean(), z.string()]),
        quote: z.string().optional().nullable(),
      }),
    )
    .max(12)
    .optional()
    .default([]),
  points: z
    .array(
      z.object({
        id: z.string(),
        relevance: z.string(),
        quality: z.string(),
        rubricLine: z.string().optional().nullable(),
        reason: z.string().optional().nullable(),
      }),
    )
    .max(40)
    .optional()
    .default([]),
  skills: z
    .array(z.object({ skill: z.string(), level: z.union([z.number(), z.string()]) }))
    .max(8)
    .optional()
    .default([]),
  gap: z.unknown().optional().nullable(),
});

export interface RateContext {
  transcript: string;
  points: readonly AnswerPoint[];
  parts: readonly string[];
  keyPoints: readonly string[];
  skills: readonly SkillRubric[];
}

const find = (supplied: readonly string[], value: string | null | undefined) =>
  supplied.find((s) => normalize(s) === normalize(value)) ?? null;

const isYes = (value: boolean | string) =>
  value === true || ["true", "yes"].includes(normalize(String(value)));

const asRelevance = (value: string) =>
  (RELEVANCE as readonly string[]).find((r) => r === normalize(value)) as Relevance | undefined;

const asQuality = (value: string) =>
  (QUALITY as readonly string[]).find((q) => q === normalize(value)) as Quality | undefined;

/**
 * Gate one model's rating. Returns null when the response is not parseable at
 * all, which the caller treats like a failed call.
 */
export function gateRating(raw: unknown, ctx: RateContext): ModelRating | null {
  const parsed = rateSchema.safeParse(raw);
  if (!parsed.success) return null;

  const parts = new Map<string, PartRating>();
  for (const item of parsed.data.parts) {
    const part = find(ctx.parts, item.part);
    if (!part || parts.has(part)) continue;
    const quote = item.quote?.trim() ?? "";
    const grounded = quote !== "" && isQuotedFrom(quote, ctx.transcript);
    const addressed = isYes(item.addressed) && grounded;
    parts.set(part, { part, addressed, quote: addressed ? quote : null });
  }

  const ids = new Set(ctx.points.map((p) => p.id));
  const points: Record<string, PointRating> = {};
  for (const item of parsed.data.points) {
    const id = item.id.trim();
    const relevance = asRelevance(item.relevance);
    const quality = asQuality(item.quality);
    if (!ids.has(id) || points[id] || !relevance || !quality) continue;
    points[id] = {
      id,
      relevance,
      quality,
      rubricLine: find(ctx.keyPoints, item.rubricLine),
      reason: (item.reason ?? "").trim().slice(0, MAX_REASON_CHARS),
    };
  }

  const skillNames = ctx.skills.map((s) => s.name);
  const skills: SkillRating[] = [];
  for (const item of parsed.data.skills) {
    const skill = find(skillNames, item.skill);
    const level = Number(item.level);
    if (!skill || skills.some((s) => s.skill === skill)) continue;
    if (!Number.isInteger(level) || level < 1 || level > 4) continue;
    skills.push({ skill, level: level as SkillLevel });
  }

  let gap: Gap | null = null;
  if (parsed.data.gap) {
    const gated = validateJudgment(parsed.data.gap, ctx.transcript, ctx.keyPoints);
    const contradicted =
      gated.ok &&
      Object.values(points).some(
        (p) => p.rubricLine === gated.value.rubricLine && credited(p.quality),
      );
    if (gated.ok && !contradicted) {
      gap = {
        rubricLine: gated.value.rubricLine,
        quote: gated.value.quote,
        missType: gated.value.missType,
        category: gated.value.category,
        plainLanguage: gated.value.plainLanguage,
      };
    }
  }

  return {
    parts: ctx.parts.map(
      (part) => parts.get(part) ?? { part, addressed: false, quote: null },
    ),
    points,
    skills,
    gap,
  };
}

const credited = (quality: Quality) => quality === "correct" || quality === "justified";

// --- combine ----------------------------------------------------------------

/**
 * | Nano          | Ultra         | Shown as      |
 * | addressed     | addressed     | addressed     |
 * | not addressed | not addressed | not addressed |
 * | differ                        | disputed      |
 *
 * With one model, its verdict stands alone and the outcome is flagged partial.
 */
export function combineParts(
  parts: readonly string[],
  nano: ModelRating | null,
  ultra: ModelRating | null,
): CombinedPart[] {
  return parts.map((part) => {
    const n = nano?.parts.find((p) => p.part === part) ?? null;
    const u = ultra?.parts.find((p) => p.part === part) ?? null;
    const status = (r: PartRating) => (r.addressed ? "addressed" : "not-addressed");
    if (n && u) return { part, status: n.addressed === u.addressed ? status(n) : "disputed", nano: n, ultra: u };
    const only = n ?? u;
    return { part, status: only ? status(only) : "not-addressed", nano: n, ultra: u };
  });
}

/**
 * A label is set only when every model that rated the point gave the same
 * one. A point is disputed when the two disagree on relevance or quality; a
 * differing rubric line alone leaves the line unset without disputing it.
 */
export function combinePoints(
  points: readonly AnswerPoint[],
  nano: ModelRating | null,
  ultra: ModelRating | null,
): CombinedPoint[] {
  return points.map((point) => {
    const n = nano?.points[point.id] ?? null;
    const u = ultra?.points[point.id] ?? null;
    const raters = [n, u].filter((r): r is PointRating => r !== null);
    const same = <K extends keyof PointRating>(key: K): PointRating[K] | null =>
      raters.length > 0 && raters.every((r) => r[key] === raters[0]![key]) ? raters[0]![key] : null;
    const relevance = same("relevance");
    const quality = same("quality");
    return {
      point,
      relevance,
      quality,
      rubricLine: same("rubricLine"),
      disputed: raters.length === 2 && (relevance === null || quality === null),
      nano: n,
      ultra: u,
    };
  });
}

/** Both levels are kept. Averaging would hide a disagreement worth seeing. */
export function combineSkills(
  skills: readonly SkillRubric[],
  nano: ModelRating | null,
  ultra: ModelRating | null,
): CombinedSkill[] {
  return skills.map((skill) => ({
    skill,
    nano: nano?.skills.find((s) => s.skill === skill.name)?.level ?? null,
    ultra: ultra?.skills.find((s) => s.skill === skill.name)?.level ?? null,
  }));
}

/**
 * The one gap to lead with. Both models must name the same line; with one
 * model, its gap stands alone. A line a combined point supports with an
 * agreed correct or justified rating is never a gap.
 */
export function pickGap(
  points: readonly CombinedPoint[],
  nano: ModelRating | null,
  ultra: ModelRating | null,
): (Gap & { from: GraderId }) | null {
  const supportedLines = new Set(
    points.filter((p) => p.rubricLine && p.quality && credited(p.quality)).map((p) => p.rubricLine),
  );
  const n = nano?.gap ?? null;
  const u = ultra?.gap ?? null;

  let chosen: (Gap & { from: GraderId }) | null = null;
  if (nano && ultra) {
    if (n && u && n.rubricLine === u.rubricLine) chosen = { ...u, from: "ultra" };
  } else if (u) {
    chosen = { ...u, from: "ultra" };
  } else if (n) {
    chosen = { ...n, from: "nano" };
  }
  return chosen && !supportedLines.has(chosen.rubricLine) ? chosen : null;
}

/**
 * Key points a twin question can close: supported by a point both models
 * rate justified and on the question.
 */
export function justifiedLines(points: readonly CombinedPoint[]): string[] {
  const lines = points
    .filter((p) => p.quality === "justified" && p.relevance === "on-question" && p.rubricLine)
    .map((p) => p.rubricLine as string);
  return [...new Set(lines)];
}

/** The next level up from the lower of the two models' levels, or null at the top. */
export function nextLevel(skill: CombinedSkill): { level: number; text: string } | null {
  const levels = [skill.nano, skill.ultra].filter((l): l is SkillLevel => l !== null);
  if (levels.length === 0) return null;
  const lowest = Math.min(...levels);
  if (lowest >= 4) return null;
  return { level: lowest + 1, text: skill.skill.levels[lowest]! };
}
