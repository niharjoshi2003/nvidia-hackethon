/**
 * Each model's agreement with human labels, from the last coach eval run.
 *
 * Read from the file the eval script writes. Until a run exists, the screen
 * says the figure has not been measured rather than showing a number.
 */

import summary from "../../eval/results/coach-summary.json";
import type { AgreementCounts } from "@/lib/agreement";
import type { GraderId } from "@/types";

export interface CoachSummary {
  measured: boolean;
  fixturePath: string | null;
  answers: number;
  lines: number;
  humans: AgreementCounts | null;
  models: Record<GraderId | "combined", AgreementCounts | null>;
}

export const COACH_SUMMARY = summary as CoachSummary;

export function accuracyLine(grader: GraderId | "combined"): string {
  const counts = COACH_SUMMARY.models[grader];
  if (!COACH_SUMMARY.measured || !counts) return "Agreement with human graders not measured yet";
  return `Agreed with human graders on ${counts.answersAgree} of ${counts.answers} answers (${counts.linesAgree} of ${counts.lines} lines)`;
}
