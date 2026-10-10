/**
 * Client orchestrator for the rated answer.
 *
 * Sends the transcript and this question's parts, key points, and skills.
 * The server extracts points and runs both raters; this file re-runs the
 * extraction gate on the same transcript to recover the same numbered points,
 * then gates both ratings locally. Nothing here writes to storage.
 */

import type { OutboundCall, RatedOutcome, Topic } from "@/types";
import { wordCount } from "@/lib/text";
import { MIN_WORDS_TO_GRADE } from "./gradeSpokenAnswer";
import { postGrade } from "./gradeParallel";
import {
  combineParts,
  combinePoints,
  combineSkills,
  gateExtraction,
  gateRating,
  justifiedLines,
  pickGap,
} from "./rateSchema";

export interface RateInput {
  topic: Topic;
  transcript: string;
  ownApiKey?: string;
  fetchImpl?: typeof fetch;
  endpoint?: string;
}

interface RateResponse {
  extract: unknown;
  nano: unknown;
  ultra: unknown;
  models: { extract: string | null; nano: string | null; ultra: string | null };
  calls: OutboundCall[];
  replay?: boolean;
}

export async function rateAnswer(input: RateInput): Promise<RatedOutcome> {
  const { topic } = input;
  const transcript = input.transcript.trim();
  const parts = topic.parts ?? [topic.framing];
  const skills = topic.skills ?? [];
  const keyPoints = topic.scaffold.keyPoints;

  if (wordCount(transcript) < MIN_WORDS_TO_GRADE) {
    return { status: "skipped", reason: "empty-transcript", calls: [] };
  }

  const posted = await postGrade<RateResponse>(
    { mode: "rate", question: topic.framing, transcript, parts, keyPoints, skills },
    input,
  );
  if (!posted.ok) {
    return { status: "failed", reason: posted.reason, detail: posted.detail, calls: posted.calls };
  }

  const { body } = posted;
  const calls = body.calls ?? [];
  const points = gateExtraction(body.extract, transcript);
  if (points.length === 0) {
    return {
      status: "failed",
      reason: "extract-error",
      detail: "no point could be matched word for word to your transcript",
      calls,
    };
  }

  const ctx = { transcript, points, parts, keyPoints, skills };
  const nano = body.nano == null ? null : gateRating(body.nano, ctx);
  const ultra = body.ultra == null ? null : gateRating(body.ultra, ctx);
  if (!nano && !ultra) {
    return {
      status: "failed",
      reason: "grade-error",
      detail: "neither model returned ratings in the expected shape",
      calls,
    };
  }

  const combined = combinePoints(points, nano, ultra);
  return {
    status: "graded",
    parts: combineParts(parts, nano, ultra),
    points: combined,
    skills: combineSkills(skills, nano, ultra),
    gap: pickGap(combined, nano, ultra),
    gaps: { nano: nano?.gap ?? null, ultra: ultra?.gap ?? null },
    supported: justifiedLines(combined),
    models: {
      extract: body.models?.extract ?? null,
      nano: nano ? body.models?.nano ?? null : null,
      ultra: ultra ? body.models?.ultra ?? null : null,
    },
    partial: !nano || !ultra,
    replay: body.replay === true,
    calls,
  };
}
