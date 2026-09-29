/**
 * Client-side orchestrator for one grade.
 *
 * Fixed order, no branching decided by a model: check the transcript, send the
 * rubric and the words to our endpoint, then run the citation gate locally.
 * The model never chooses the next step and never writes to storage — the
 * screen appends a miss only when this returns `graded`.
 *
 * The gate runs here rather than on the server on purpose. This is the only
 * place that holds the transcript the user actually spoke, so a grade is
 * checked against the real source rather than against whatever the server was
 * told the source was.
 */

import {
  rubricLines,
  type GradeFailureReason,
  type GradeOutcome,
  type OutboundCall,
  type Topic,
} from "@/types";
import { validateCoverage, validateJudgment } from "./gradeSchema";
import { wordCount } from "@/lib/text";

/** Below this, there is nothing to grade and the judgment call is not made. */
export const MIN_WORDS_TO_GRADE = 8;

export interface GradeInput {
  topic: Topic;
  transcript: string;
  ownApiKey?: string;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
  endpoint?: string;
}

interface GradeResponse {
  coverage: unknown;
  judgment: unknown;
  models: { coverage: string; judgment: string };
  calls: OutboundCall[];
}

export async function gradeSpokenAnswer(input: GradeInput): Promise<GradeOutcome> {
  const { topic, ownApiKey } = input;
  const transcript = input.transcript.trim();
  const doFetch = input.fetchImpl ?? fetch;
  const endpoint = input.endpoint ?? "/api/grade";

  // 1. Nothing was said. No call is made at all, so silence costs nothing.
  if (wordCount(transcript) < MIN_WORDS_TO_GRADE) {
    return { status: "skipped", reason: "empty-transcript", calls: [] };
  }

  // 2. One request, carrying only the words and this topic's rubric.
  let payload: GradeResponse;
  let calls: OutboundCall[] = [];
  try {
    const res = await doFetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(ownApiKey ? { "x-token-factory-key": ownApiKey } : {}),
      },
      body: JSON.stringify({
        transcript,
        keyPoints: topic.scaffold.keyPoints,
        gotchas: topic.scaffold.commonGotchas,
        modelAnswerLines: topic.modelAnswer,
      }),
    });

    const body = (await res.json().catch(() => null)) as
      | (Partial<GradeResponse> & { error?: string; detail?: string })
      | null;
    calls = body?.calls ?? [];

    if (!res.ok) {
      return {
        status: "failed",
        reason: failureReason(res.status, body?.error),
        detail: body?.detail ?? body?.error ?? `HTTP ${res.status}`,
        calls,
      };
    }
    if (!body?.models) {
      return { status: "failed", reason: "network-error", detail: "malformed response", calls };
    }
    payload = body as GradeResponse;
  } catch (error) {
    return {
      status: "failed",
      reason: "network-error",
      detail: error instanceof Error ? error.message : String(error),
      calls,
    };
  }

  // 3. The gate. A judgment that cannot cite the speaker's words and one of
  //    the rubric lines we sent does not become a miss.
  const supplied = rubricLines(topic);
  const gated = validateJudgment(payload.judgment, transcript, supplied);

  if (!gated.ok) {
    return { status: "rejected", reason: gated.reason, detail: gated.detail, calls: payload.calls };
  }

  const coverage = validateCoverage(payload.coverage, topic.scaffold.keyPoints);

  return {
    status: "graded",
    miss: {
      topicId: topic.id,
      attemptId: "", // assigned by the screen when the attempt is saved
      at: new Date().toISOString(),
      missType: gated.value.missType,
      category: gated.value.category,
      quote: gated.value.quote,
      rubricLine: gated.value.rubricLine,
      plainLanguage: gated.value.plainLanguage,
      models: payload.models,
      calls: payload.calls,
    },
    coverage: {
      covered: [...new Set([...coverage.covered, ...gated.value.coveredRubricLines])],
      skipped: coverage.skipped,
    },
    calls: payload.calls,
  };
}

const FAILURE_REASONS: Record<string, GradeFailureReason> = {
  "rate-limited": "rate-limited",
  "quota-reached": "quota-reached",
  "coverage-error": "coverage-error",
  "judgment-error": "judgment-error",
  "unknown-topic": "unknown-topic",
};

function failureReason(status: number, error?: string): GradeFailureReason {
  const mapped = error ? FAILURE_REASONS[error] : undefined;
  if (mapped) return mapped;
  if (status === 429) return "rate-limited";
  return "network-error";
}
