/**
 * Repaired answer: the candidate's own answer plus only the missed points.
 *
 * A sentence survives only if it is either the candidate's own words (found in
 * the transcript) or an addition tagged with one of the missed lines, copied
 * exactly. Everything else is dropped and counted, so the screen can say how
 * much the model tried to add beyond what it was asked for.
 */

import { z } from "zod";
import type { GradeFailureReason, OutboundCall } from "@/types";
import { isQuotedFrom, isSuppliedLine, normalize } from "@/lib/text";
import { postGrade } from "./gradeParallel";

const repairSchema = z.object({
  sentences: z
    .array(z.object({ text: z.string(), rubricLine: z.string().nullable().optional() }))
    .max(60),
});

export interface RepairedSentence {
  text: string;
  /** Null for the candidate's own sentence. */
  rubricLine: string | null;
}

export interface ValidatedRepair {
  sentences: RepairedSentence[];
  /** Missed lines that at least one surviving addition covers. */
  covered: string[];
  dropped: number;
}

export function validateRepair(
  raw: unknown,
  transcript: string,
  missedLines: readonly string[],
): ValidatedRepair | null {
  const parsed = repairSchema.safeParse(raw);
  if (!parsed.success) return null;

  const sentences: RepairedSentence[] = [];
  const covered = new Set<string>();
  let dropped = 0;

  for (const item of parsed.data.sentences) {
    const text = item.text.trim();
    if (!text) continue;
    const tag = item.rubricLine?.trim() ?? "";

    if (tag) {
      if (!isSuppliedLine(tag, missedLines)) {
        dropped += 1;
        continue;
      }
      const line = missedLines.find((l) => normalize(l) === normalize(tag)) ?? tag;
      covered.add(line);
      sentences.push({ text, rubricLine: line });
      continue;
    }

    if (isQuotedFrom(text.replace(/[.!?]+$/, ""), transcript)) {
      sentences.push({ text, rubricLine: null });
    } else {
      dropped += 1;
    }
  }

  if (covered.size === 0) return null;
  return { sentences, covered: [...covered], dropped };
}

export type RepairOutcome =
  | { status: "repaired"; repair: ValidatedRepair; model: string; calls: OutboundCall[] }
  | { status: "rejected"; detail: string; calls: OutboundCall[] }
  | { status: "failed"; reason: GradeFailureReason; detail: string; calls: OutboundCall[] };

export async function repairAnswer(input: {
  transcript: string;
  missedLines: string[];
  ownApiKey?: string;
  fetchImpl?: typeof fetch;
  endpoint?: string;
}): Promise<RepairOutcome> {
  const posted = await postGrade<{ repair: unknown; model: string; calls: OutboundCall[] }>(
    { mode: "repair", transcript: input.transcript, missedLines: input.missedLines },
    input,
  );
  if (!posted.ok) {
    return { status: "failed", reason: posted.reason, detail: posted.detail, calls: posted.calls };
  }
  const calls = posted.body.calls ?? [];
  const repair = validateRepair(posted.body.repair, input.transcript, input.missedLines);
  if (!repair) {
    return {
      status: "rejected",
      detail: "no added sentence carried a missed rubric line, so nothing was kept",
      calls,
    };
  }
  return { status: "repaired", repair, model: posted.body.model, calls };
}
