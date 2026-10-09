/**
 * The citation gate.
 *
 * This is the file the whole project is built around. Everything upstream is
 * plumbing; this is the part that makes the evaluator trustworthy. A judgment
 * reaches the user only if:
 *
 *   - it parses against the schema,
 *   - its `category` is one of our closed set (so the cross-topic pattern view
 *     is computable),
 *   - its `quote` really occurs in what the speaker said, and
 *   - its `rubricLine` is verbatim one of the lines we put in the prompt.
 *
 * Failing any of these is a REJECTION, which is shown to the user as the
 * evaluator declining to support its claim. It is not an error to be swallowed.
 * A paraphrased rubric line is a rejection on purpose: if the model is allowed
 * to reword the rubric, "grounded in your rubric" stops meaning anything.
 */

import { z } from "zod";
import {
  MISS_CATEGORIES,
  type GradeRejectionReason,
  type MissCategory,
} from "@/types";
import { isQuotedFrom, isSuppliedLine, normalize } from "@/lib/text";

// --- wire shapes ------------------------------------------------------------

/** Cheap pass, normalised: which rubric key points did the answer cover? */
export const coverageSchema = z.object({
  covered: z.array(z.string()).max(32),
  skipped: z.array(z.string()).max(32),
});

/**
 * What the coverage model actually returns. A "covered" entry counts only when
 * its evidence is a real fragment of the transcript; the model was marking
 * every point covered, or every point skipped, when it only had to sort strings.
 */
const coverageItemsSchema = z.object({
  items: z
    .array(
      z.object({
        point: z.string(),
        status: z.string(),
        evidence: z.string().optional(),
      }),
    )
    .max(32),
});

/**
 * Judgment pass. `category` is a plain string here rather than an enum so an
 * unrecognised value produces a precise rejection reason instead of a generic
 * schema error.
 */
export const judgmentSchema = z.object({
  missType: z.string().trim().min(1).max(64),
  category: z.string().trim().min(1).max(64),
  quote: z.string().trim().min(1).max(280),
  rubricLine: z.string().trim().min(1).max(400),
  plainLanguage: z.string().trim().min(1).max(320),
  /** Lines the evaluator believes were covered. Only used to close old misses. */
  coveredRubricLines: z.array(z.string()).max(32).optional(),
});

export type RawJudgment = z.infer<typeof judgmentSchema>;

/** The judgment model's "nothing substantive was missed" answer. */
export const noMissSchema = z.object({
  noMiss: z.literal(true),
  coveredRubricLines: z.array(z.string()).max(32).optional(),
});

export interface ValidatedJudgment {
  missType: string;
  category: MissCategory;
  quote: string;
  rubricLine: string;
  plainLanguage: string;
  coveredRubricLines: string[];
}

export type GateResult =
  | { ok: true; value: ValidatedJudgment }
  | { ok: false; reason: GradeRejectionReason; detail: string };

// --- coverage ---------------------------------------------------------------

export interface CoverageValidation {
  covered: string[];
  skipped: string[];
  /** Strings the model returned that were not in the supplied key points. */
  invented: string[];
}

/**
 * Coverage is filtered rather than rejected.
 *
 * It never appears to the user as a claim on its own; it only narrows the
 * judgment prompt and closes older misses. Dropping unsupported strings keeps
 * one sloppy cheap-pass response from failing an otherwise good grade, and
 * `invented` is kept so the evaluation can report how often it happens.
 *
 * The model shape (`items`) is stronger than the normalised arrays: a point
 * counts as covered only when its evidence quote actually occurs in the
 * transcript. An unsupported "covered" is treated as skipped, so a complete-
 * answer verdict cannot be vouched for by a list the model did not ground.
 */
function coverageFromItems(
  items: Array<{ point: string; status: string; evidence?: string }>,
  keyPoints: readonly string[],
  transcript: string,
): CoverageValidation {
  const invented: string[] = [];
  const covered = new Set<string>();
  const skipped = new Set<string>();

  for (const item of items) {
    const point = keyPoints.find((candidate) => normalize(candidate) === normalize(item.point));
    if (!point) {
      if (item.point.trim()) invented.push(item.point);
      continue;
    }
    const grounded =
      normalize(item.status) === "covered" && isQuotedFrom(item.evidence ?? "", transcript);
    if (grounded) covered.add(point);
    else skipped.add(point);
  }
  for (const point of covered) skipped.delete(point);

  return { covered: [...covered], skipped: [...skipped], invented };
}

export function validateCoverage(
  raw: unknown,
  keyPoints: readonly string[],
  transcript = "",
): CoverageValidation {
  const items = coverageItemsSchema.safeParse(raw);
  if (items.success) return coverageFromItems(items.data.items, keyPoints, transcript);

  const parsed = coverageSchema.safeParse(raw);
  if (!parsed.success) return { covered: [], skipped: [], invented: [] };

  const invented: string[] = [];
  const keep = (list: string[]) =>
    list.filter((line) => {
      const supplied = isSuppliedLine(line, keyPoints);
      if (!supplied) invented.push(line);
      return supplied;
    });

  // Canonicalise to the exact supplied casing so downstream equality is trivial.
  const canonical = (line: string) =>
    keyPoints.find((p) => normalize(p) === normalize(line)) ?? line;

  return {
    covered: keep(parsed.data.covered).map(canonical),
    skipped: keep(parsed.data.skipped).map(canonical),
    invented,
  };
}

// --- judgment ---------------------------------------------------------------

function isMissCategory(value: string): value is MissCategory {
  return (MISS_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Run the full gate over a raw judgment response.
 *
 * @param raw        parsed JSON from the judgment model
 * @param transcript what the speaker actually said
 * @param supplied   the exact rubric lines sent in the prompt, from rubricLines()
 */
export function validateJudgment(
  raw: unknown,
  transcript: string,
  supplied: readonly string[],
): GateResult {
  const parsed = judgmentSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      reason: "schema-invalid",
      detail: issue ? `${issue.path.join(".") || "response"}: ${issue.message}` : "unparseable",
    };
  }

  const value = parsed.data;

  const category = value.category.toLowerCase().replace(/[\s_]+/g, "-");
  if (!isMissCategory(category)) {
    return {
      ok: false,
      reason: "category-not-recognised",
      detail: `"${value.category}" is not one of the ${MISS_CATEGORIES.length} allowed categories`,
    };
  }

  if (!isQuotedFrom(value.quote, transcript)) {
    return {
      ok: false,
      reason: "quote-not-in-transcript",
      detail: "the quote does not occur in what was said",
    };
  }

  if (!isSuppliedLine(value.rubricLine, supplied)) {
    return {
      ok: false,
      reason: "rubric-line-not-supplied",
      detail: "the rubric line was reworded rather than copied",
    };
  }

  // Pin both citations to the source spelling so the UI can highlight the quote
  // inside the transcript and match the rubric line by equality later.
  const canonicalRubricLine =
    supplied.find((line) => normalize(line) === normalize(value.rubricLine)) ?? value.rubricLine;

  return {
    ok: true,
    value: {
      missType: value.missType,
      category,
      quote: exactSpanFrom(value.quote, transcript),
      rubricLine: canonicalRubricLine,
      plainLanguage: value.plainLanguage,
      coveredRubricLines: (value.coveredRubricLines ?? []).filter((line) =>
        isSuppliedLine(line, supplied),
      ),
    },
  };
}

export type NoMissResult =
  | { ok: true; coveredRubricLines: string[] }
  | { ok: false; reason: GradeRejectionReason; detail: string };

/**
 * Gate for a "no miss" verdict, or null when the response is not one.
 *
 * An absence cannot be cited, so it is cross-checked instead: the verdict is
 * accepted only when the independent coverage pass marked every key point as
 * covered. An empty or malformed coverage response therefore cannot vouch for
 * it. Without this, "nothing missed" would be the one claim that bypasses the
 * gate.
 */
export function validateNoMiss(
  raw: unknown,
  coverage: CoverageValidation,
  keyPoints: readonly string[],
  supplied: readonly string[],
): NoMissResult | null {
  const parsed = noMissSchema.safeParse(raw);
  if (!parsed.success) return null;

  const covered = new Set(coverage.covered.map(normalize));
  const uncovered = keyPoints.filter((point) => !covered.has(normalize(point)));
  if (uncovered.length > 0) {
    return {
      ok: false,
      reason: "clean-contradicts-coverage",
      detail: `the coverage pass did not confirm ${uncovered.length} key point(s)`,
    };
  }

  return {
    ok: true,
    coveredRubricLines: (parsed.data.coveredRubricLines ?? []).filter((line) =>
      isSuppliedLine(line, supplied),
    ),
  };
}

/**
 * Recover the speaker's original casing and punctuation for a quote.
 *
 * The gate matches on normalised text, but the UI shows the quote back to the
 * user, and showing it lowercased makes a real citation look machine-mangled.
 * Falls back to the model's version if the span cannot be located, which only
 * happens when normalisation collapsed characters that changed the length.
 */
function exactSpanFrom(quote: string, transcript: string): string {
  const needle = normalize(quote);
  const words = transcript.split(/(\s+)/);
  for (let start = 0; start < words.length; start += 1) {
    let span = "";
    for (let end = start; end < words.length; end += 1) {
      span += words[end] ?? "";
      const candidate = normalize(span);
      if (candidate === needle) return span.trim();
      if (candidate.length > needle.length) break;
    }
  }
  return quote;
}
