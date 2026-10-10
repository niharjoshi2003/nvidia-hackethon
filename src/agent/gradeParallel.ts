/**
 * Client orchestrator for the parallel grade.
 *
 * Same fixed order as the two-stage path: check the transcript, send only the
 * words and this topic's key points, then gate both models locally against the
 * transcript the user actually has. Nothing here writes to storage.
 */

import type {
  GradeFailureReason,
  OutboundCall,
  ParallelOutcome,
  Topic,
} from "@/types";
import { wordCount } from "@/lib/text";
import { MIN_WORDS_TO_GRADE } from "./gradeSpokenAnswer";
import { combineVerdicts, gateLineGrade, pickHeadline } from "./parallelSchema";

export interface ParallelInput {
  topic: Topic;
  transcript: string;
  ownApiKey?: string;
  fetchImpl?: typeof fetch;
  endpoint?: string;
}

interface ParallelResponse {
  nano: unknown;
  ultra: unknown;
  models: { nano: string | null; ultra: string | null };
  calls: OutboundCall[];
  replay?: boolean;
}

export type PostResult<T> =
  | { ok: true; body: T }
  | { ok: false; reason: GradeFailureReason; detail: string; calls: OutboundCall[] };

/** One POST to the grading endpoint, with failures mapped to a closed set. */
export async function postGrade<T extends { calls?: OutboundCall[] }>(
  body: unknown,
  options: { ownApiKey?: string; fetchImpl?: typeof fetch; endpoint?: string },
): Promise<PostResult<T>> {
  const doFetch = options.fetchImpl ?? fetch;
  try {
    const res = await doFetch(options.endpoint ?? "/api/grade", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(options.ownApiKey ? { "x-token-factory-key": options.ownApiKey } : {}),
      },
      body: JSON.stringify(body),
    });
    const parsed = (await res.json().catch(() => null)) as
      | (T & { error?: string; detail?: string })
      | null;
    const calls = parsed?.calls ?? [];
    if (!res.ok || !parsed) {
      return {
        ok: false,
        reason: failureReason(res.status, parsed?.error),
        detail: parsed?.detail ?? parsed?.error ?? `HTTP ${res.status}`,
        calls,
      };
    }
    return { ok: true, body: parsed };
  } catch (error) {
    return {
      ok: false,
      reason: "network-error",
      detail: error instanceof Error ? error.message : String(error),
      calls: [],
    };
  }
}

export async function gradeParallel(input: ParallelInput): Promise<ParallelOutcome> {
  const { topic } = input;
  const transcript = input.transcript.trim();
  const keyPoints = topic.scaffold.keyPoints;

  if (wordCount(transcript) < MIN_WORDS_TO_GRADE) {
    return { status: "skipped", reason: "empty-transcript", calls: [] };
  }

  const posted = await postGrade<ParallelResponse>(
    { mode: "parallel", transcript, keyPoints },
    input,
  );
  if (!posted.ok) {
    return { status: "failed", reason: posted.reason, detail: posted.detail, calls: posted.calls };
  }

  const { body } = posted;
  const calls = body.calls ?? [];
  const nano = body.nano == null ? null : gateLineGrade(body.nano, keyPoints, transcript);
  const ultra = body.ultra == null ? null : gateLineGrade(body.ultra, keyPoints, transcript);

  if (!nano && !ultra) {
    return {
      status: "failed",
      reason: "grade-error",
      detail: "neither model returned verdicts in the expected shape",
      calls,
    };
  }

  const lines = combineVerdicts(keyPoints, nano?.verdicts ?? null, ultra?.verdicts ?? null);
  return {
    status: "graded",
    lines,
    headline: pickHeadline(lines, { nano: nano?.headline ?? null, ultra: ultra?.headline ?? null }),
    models: {
      nano: nano ? body.models?.nano ?? null : null,
      ultra: ultra ? body.models?.ultra ?? null : null,
    },
    partial: !nano || !ultra,
    replay: body.replay === true,
    calls,
  };
}

const FAILURE_REASONS: Record<string, GradeFailureReason> = {
  "rate-limited": "rate-limited",
  "quota-reached": "quota-reached",
  "grade-error": "grade-error",
  "extract-error": "extract-error",
  "repair-error": "repair-error",
  "coverage-error": "coverage-error",
  "judgment-error": "judgment-error",
};

function failureReason(status: number, error?: string): GradeFailureReason {
  const mapped = error ? FAILURE_REASONS[error] : undefined;
  if (mapped) return mapped;
  if (status === 429) return "rate-limited";
  return "network-error";
}
