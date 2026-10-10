/**
 * Agreement with human labels, per line and per answer.
 *
 * Shared by the eval script and the results screen so the number on screen is
 * computed the same way as the number in the README. Counts, not percentages.
 */

import type { CombinedLine, LineStatus, LineVerdict } from "@/types";

/** One person's labels for one answer: every key point, covered or missed. */
export type HumanLabels = Record<string, LineStatus>;

export interface AgreementCounts {
  /** Answers where every labelled line matched. */
  answersAgree: number;
  answers: number;
  linesAgree: number;
  lines: number;
  /** Model said missed where the human said covered. The costly error. */
  falseMisses: number;
  /** Lines the model left undecided (disputed, for the combination). */
  abstained: number;
}

export const emptyCounts = (): AgreementCounts => ({
  answersAgree: 0,
  answers: 0,
  linesAgree: 0,
  lines: 0,
  falseMisses: 0,
  abstained: 0,
});

/**
 * Score one answer. `verdict(line)` returns the model's call, or null when it
 * abstained. An abstention is not an agreement, and it is counted.
 */
export function scoreAnswer(
  counts: AgreementCounts,
  labels: HumanLabels,
  verdict: (line: string) => LineStatus | null,
): AgreementCounts {
  const entries = Object.entries(labels);
  let all = entries.length > 0;
  const next = { ...counts, answers: counts.answers + 1 };
  for (const [line, human] of entries) {
    const model = verdict(line);
    next.lines += 1;
    if (model === null) {
      next.abstained += 1;
      all = false;
      continue;
    }
    if (model === human) next.linesAgree += 1;
    else {
      all = false;
      if (model === "missed" && human === "covered") next.falseMisses += 1;
    }
  }
  if (all) next.answersAgree += 1;
  return next;
}

export const fromVerdicts =
  (verdicts: readonly LineVerdict[] | null) =>
  (line: string): LineStatus | null =>
    verdicts?.find((v) => v.line === line)?.status ?? null;

export const fromCombined =
  (lines: readonly CombinedLine[]) =>
  (line: string): LineStatus | null => {
    const status = lines.find((l) => l.line === line)?.status;
    return status === "covered" || status === "missed" ? status : null;
  };

/** Human-vs-human, the ceiling every model number is read against. */
export function interRater(pairs: Array<{ a: HumanLabels; b: HumanLabels }>): AgreementCounts {
  return pairs.reduce(
    (counts, { a, b }) => scoreAnswer(counts, a, (line) => b[line] ?? null),
    emptyCounts(),
  );
}
