/**
 * Two pure helpers for the results screen.
 *
 * plainVerdict: one honest sentence that reconciles "did you answer the
 * question" with "how good were the points". Showing "You answered every part"
 * beside "Developing" read as a contradiction; the sentence has to say both.
 *
 * locatePoints: finds each rated point inside the transcript so the screen can
 * highlight the candidate's own words instead of listing detached quotes.
 */

import type { CombinedPoint, RatedOutcome } from "@/types";

type Graded = Extract<RatedOutcome, { status: "graded" }>;

/**
 * Stands in for a point whose wording an archived result did not preserve.
 * It is not the candidate's speech, so screens collapse these rows instead of
 * printing the placeholder as if it were a quote.
 */
export const UNRECORDED_QUOTE = "[wording not included in the saved sample]";

export interface PlainVerdict {
  /** The main sentence. */
  sentence: string;
  /** A second sentence about disagreement between the models, or empty. */
  note: string;
}

const isCredited = (p: CombinedPoint) =>
  !p.disputed && (p.quality === "correct" || p.quality === "justified");
const isWeak = (p: CombinedPoint) => !p.disputed && (p.quality === "vague" || p.quality === "wrong");

export function plainVerdict(outcome: Pick<Graded, "parts" | "points">): PlainVerdict {
  const total = outcome.parts.length;
  const addressed = outcome.parts.filter((p) => p.status === "addressed").length;
  const credited = outcome.points.filter(isCredited).length;
  const weak = outcome.points.filter(isWeak).length;
  const disputed = outcome.points.filter((p) => p.disputed).length;
  const rated = credited + weak + disputed;

  let lead: string;
  if (total === 0) lead = "Your answer was rated";
  else if (addressed === total) lead = "You spoke to every part of the question";
  else if (addressed === 0) lead = "You did not directly answer the question yet";
  else lead = `You spoke to ${addressed} of ${total} parts of the question`;

  let tail = "";
  if (rated > 0) {
    if (weak > credited) {
      tail = `most of your points were vague or wrong (${weak} of ${rated})`;
    } else if (credited > 0) {
      tail = `${credited} of your ${rated} points were correct or justified`;
    } else {
      tail = "the two models could not agree on the quality of your points";
    }
  }

  const joiner = addressed === total && weak > credited ? ", but " : ", and ";
  const sentence = tail ? `${lead}${joiner}${tail}.` : `${lead}.`;
  const note =
    disputed > 0
      ? `The two models disagreed on ${disputed} point${disputed === 1 ? "" : "s"}; those are not credited.`
      : "";
  return { sentence, note };
}

// --- transcript highlighting -----------------------------------------------

export interface TranscriptSegment {
  text: string;
  /** Present when this stretch of the transcript is a rated point. */
  point?: CombinedPoint;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A regex that finds `quote` the way the gate matches it: case, spacing and quote marks ignored. */
function quotePattern(quote: string): RegExp | null {
  const words = quote.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const body = words
    .map((w) =>
      escapeRegex(w)
        .replace(/['\u2018\u2019]/g, "['\u2018\u2019]")
        .replace(/["\u201c\u201d]/g, '["\u201c\u201d]'),
    )
    .join("\\s+");
  return new RegExp(body, "i");
}

export interface LocatedTranscript {
  segments: TranscriptSegment[];
  /** Points whose quote could not be found in the transcript. */
  unplaced: CombinedPoint[];
}

export function locatePoints(transcript: string, points: CombinedPoint[]): LocatedTranscript {
  const found: Array<{ start: number; end: number; point: CombinedPoint }> = [];
  const unplaced: CombinedPoint[] = [];

  for (const point of points) {
    const pattern = quotePattern(point.point.quote);
    const match = pattern ? pattern.exec(transcript) : null;
    if (!match) {
      unplaced.push(point);
      continue;
    }
    const start = match.index;
    const end = start + match[0].length;
    // The gate removes overlaps, but a repeated phrase could still collide here.
    if (found.some((f) => start < f.end && end > f.start)) {
      unplaced.push(point);
      continue;
    }
    found.push({ start, end, point });
  }

  found.sort((a, b) => a.start - b.start);

  const segments: TranscriptSegment[] = [];
  let cursor = 0;
  for (const f of found) {
    if (f.start > cursor) segments.push({ text: transcript.slice(cursor, f.start) });
    segments.push({ text: transcript.slice(f.start, f.end), point: f.point });
    cursor = f.end;
  }
  if (cursor < transcript.length) segments.push({ text: transcript.slice(cursor) });

  return { segments, unplaced };
}
