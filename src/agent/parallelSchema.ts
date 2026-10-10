/**
 * Parallel grading: one schema, two models, one gate, one combine table.
 *
 * Nano and Ultra receive the same prompt and return the same shape. Each
 * verdict passes through the same citation gate before the two are compared,
 * so a model cannot win a disagreement by inventing a quote:
 *
 *   - a "covered" verdict whose quote is not in the transcript becomes missed,
 *   - a line the model invented is dropped,
 *   - a supplied line the model left out is treated as missed.
 *
 * The combine table is code, not a model, and disputed lines are never
 * averaged: the candidate decides them, and that decision is stored as a label.
 */

import { z } from "zod";
import type {
  CombinedLine,
  CombinedStatus,
  GraderId,
  HeadlineMiss,
  LineVerdict,
} from "@/types";
import { isQuotedFrom, normalize } from "@/lib/text";
import { validateJudgment } from "./gradeSchema";

// --- wire shape -------------------------------------------------------------

export const lineGradeSchema = z.object({
  lines: z
    .array(
      z.object({
        line: z.string(),
        status: z.string(),
        quote: z.string().optional().nullable(),
      }),
    )
    .max(32),
  headline: z.unknown().optional().nullable(),
});

export interface GatedLineGrade {
  verdicts: LineVerdict[];
  /** Lines the model returned that were not supplied. Counted, never shown. */
  invented: string[];
  /** "covered" verdicts demoted to missed because their quote failed the gate. */
  demoted: string[];
  /** The model's headline, if it survived the judgment gate. */
  headline: Omit<HeadlineMiss, "from"> | null;
}

/**
 * Gate one model's per-line output. Returns null when the response is not
 * parseable at all, which the caller treats like a failed call.
 */
export function gateLineGrade(
  raw: unknown,
  keyPoints: readonly string[],
  transcript: string,
): GatedLineGrade | null {
  const parsed = lineGradeSchema.safeParse(raw);
  if (!parsed.success) return null;

  const byLine = new Map<string, LineVerdict>();
  const invented: string[] = [];
  const demoted: string[] = [];

  for (const item of parsed.data.lines) {
    const line = keyPoints.find((point) => normalize(point) === normalize(item.line));
    if (!line) {
      if (item.line.trim()) invented.push(item.line);
      continue;
    }
    if (byLine.has(line)) continue;

    const claimed = normalize(item.status) === "covered";
    const quote = item.quote?.trim() ?? "";
    const grounded = quote !== "" && isQuotedFrom(quote, transcript);

    if (claimed && !grounded) demoted.push(line);
    byLine.set(line, {
      line,
      status: claimed && grounded ? "covered" : "missed",
      quote: grounded ? quote : null,
    });
  }

  const verdicts = keyPoints.map(
    (line) => byLine.get(line) ?? { line, status: "missed" as const, quote: null },
  );

  let headline: GatedLineGrade["headline"] = null;
  if (parsed.data.headline) {
    const gated = validateJudgment(parsed.data.headline, transcript, keyPoints);
    if (gated.ok) {
      headline = {
        rubricLine: gated.value.rubricLine,
        quote: gated.value.quote,
        missType: gated.value.missType,
        category: gated.value.category,
        plainLanguage: gated.value.plainLanguage,
      };
    }
  }

  return { verdicts, invented, demoted, headline };
}

// --- combine ----------------------------------------------------------------

/**
 * The combine table, one row per key point.
 *
 * | Nano    | Ultra   | Shown as |
 * | covered | covered | covered  |
 * | missed  | missed  | missed   |
 * | differ          | disputed |
 *
 * When one model failed, the other's verdict stands alone and the outcome is
 * flagged partial, so the screen never implies a second opinion it lacks.
 */
export function combineVerdicts(
  keyPoints: readonly string[],
  nano: readonly LineVerdict[] | null,
  ultra: readonly LineVerdict[] | null,
): CombinedLine[] {
  const find = (list: readonly LineVerdict[] | null, line: string) =>
    list?.find((v) => v.line === line) ?? null;

  return keyPoints.map((line) => {
    const n = find(nano, line);
    const u = find(ultra, line);
    let status: CombinedStatus;
    if (n && u) status = n.status === u.status ? n.status : "disputed";
    else status = (n ?? u)?.status ?? "missed";
    return { line, status, nano: n, ultra: u };
  });
}

/**
 * The one miss to lead with.
 *
 * Ultra's headline wins when it survived the gate and lands on a line both
 * models call missed; Nano's is the fallback under the same rule. A headline on
 * a disputed or covered line is dropped: the headline must be something the
 * combine table agrees was missed. Null is an acceptable answer.
 */
export function pickHeadline(
  lines: readonly CombinedLine[],
  candidates: Partial<Record<GraderId, GatedLineGrade["headline"]>>,
): HeadlineMiss | null {
  const missed = new Set(lines.filter((l) => l.status === "missed").map((l) => l.line));
  for (const from of ["ultra", "nano"] as const) {
    const headline = candidates[from];
    if (headline && missed.has(headline.rubricLine)) return { ...headline, from };
  }
  return null;
}

/** Lines both models (or the only model) agree were covered. */
export function agreedCovered(lines: readonly CombinedLine[]): string[] {
  return lines.filter((l) => l.status === "covered").map((l) => l.line);
}
