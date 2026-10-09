/**
 * Domain model for sixty.
 *
 * Two invariants drive most of the shapes below:
 *
 *  1. The evaluator may only cite. A stored miss always carries a quote that
 *     occurs in the transcript and a rubric line that was sent in the prompt.
 *     Anything that fails those checks never becomes a SpokenMiss.
 *  2. Nothing leaves the browser except a transcript and the rubric lines for
 *     the topic being graded. Audio, progress, and the miss log stay local.
 */

// --- catalog ----------------------------------------------------------------

export type Track = "agentic" | "system-design" | "llm-core" | "swe";

export type Difficulty = "foundational" | "core" | "advanced";

export const TRACK_LABELS: Record<Track, string> = {
  agentic: "Agentic AI",
  "system-design": "System design",
  "llm-core": "LLM core",
  swe: "Software engineering",
};

export interface TopicScaffold {
  /** 5 to 7 specific, checkable claims. These are the primary rubric lines. */
  keyPoints: string[];
  /** 2 to 4 traps. A strong answer either avoids or names these. */
  commonGotchas: string[];
  /** The beats of a good 60 seconds, shown while researching. */
  sixtySecondStructure: string[];
  /** Likely follow-ups. Context for the learner, not graded. */
  followUps: string[];
}

export interface Topic {
  id: string;
  track: Track;
  title: string;
  difficulty: Difficulty;
  /** How an interviewer actually opens this topic. */
  framing: string;
  interviewQuestions: string[];
  /** Lines a strong spoken answer would contain. Also rubric lines. */
  modelAnswer: string[];
  scaffold: TopicScaffold;
  /** 'seed' ships with the app, 'imported' came from a user rubric file. */
  source: "seed" | "imported";
}

/**
 * The exact set of lines the evaluator is allowed to cite for a topic.
 * Shared by the prompt builder and the citation gate so the two can never
 * drift apart: if a line was not produced here, a grade naming it is rejected.
 */
export function rubricLines(topic: Topic): string[] {
  return [
    ...topic.scaffold.keyPoints,
    ...topic.scaffold.commonGotchas,
    ...topic.modelAnswer,
  ];
}

// --- attempts ---------------------------------------------------------------

export interface SelfRating {
  clarity: number; // 1-5
  depth: number; // 1-5
  structure: number; // 1-5
}

export interface Attempt {
  id: string;
  topicId: string;
  at: string; // ISO
  spokenSeconds: number;
  ratings: SelfRating;
  /** The required "what did I forget" note. */
  note: string;
  /**
   * Kept locally so a later session can show this answer beside the next one.
   * Null when the microphone or transcription was unavailable.
   */
  transcript: string | null;
}

// --- the miss ---------------------------------------------------------------

/**
 * A closed set, chosen by the judgment model from this list and nothing else.
 *
 * Free text alone cannot drive the cross-topic pattern view: "you skipped the
 * failure mode in 7 of 9 answers" is only computable if every miss lands in a
 * comparable bucket. The short `missType` stays free text for display.
 */
export const MISS_CATEGORIES = [
  "missing-tradeoff",
  "missing-failure-mode",
  "missing-mechanism",
  "missing-constraint",
  "missing-concrete-detail",
  "incorrect-claim",
  "unstructured-answer",
] as const;

export type MissCategory = (typeof MISS_CATEGORIES)[number];

export const MISS_CATEGORY_LABELS: Record<MissCategory, string> = {
  "missing-tradeoff": "Did not weigh a tradeoff",
  "missing-failure-mode": "Did not cover what breaks",
  "missing-mechanism": "Named the idea, not the mechanism",
  "missing-constraint": "Ignored a stated constraint",
  "missing-concrete-detail": "Stayed abstract, no specifics",
  "incorrect-claim": "Said something inaccurate",
  "unstructured-answer": "Structure made it hard to follow",
};

export type MissStatus = "open" | "resolved";

export interface SpokenMiss {
  id: string;
  topicId: string;
  /** Same id as the Attempt this came from, so the pair can be shown together. */
  attemptId: string;
  at: string;
  status: MissStatus;

  /** Short display label, e.g. "skipped idempotency key". */
  missType: string;
  /** Bucket for the cross-topic pattern view. */
  category: MissCategory;
  /** Verbatim from the transcript. Verified before this object exists. */
  quote: string;
  /** Verbatim from rubricLines(topic). Verified before this object exists. */
  rubricLine: string;
  /** One or two sentences, shown before the next attempt on this topic. */
  plainLanguage: string;

  /** Provenance, rendered in the UI so the model use is inspectable. */
  models: { coverage: string; judgment: string };
  calls: OutboundCall[];

  resolvedAt: string | null;
  resolvedBy: "user" | "later-grade" | null;
}

// --- grading ----------------------------------------------------------------

export interface OutboundCall {
  at: string;
  provider: "token-factory";
  model: string;
  purpose: "coverage" | "judgment";
  ms: number;
  ok: boolean;
  promptTokens: number | null;
  completionTokens: number | null;
  error?: string;
}

export type GradeStatus = "graded" | "clean" | "rejected" | "failed" | "skipped";

export type GradeRejectionReason =
  | "quote-not-in-transcript"
  | "rubric-line-not-supplied"
  | "schema-invalid"
  | "category-not-recognised"
  | "clean-contradicts-coverage";

export type GradeFailureReason =
  | "unknown-topic"
  | "coverage-error"
  | "judgment-error"
  | "timeout"
  | "rate-limited"
  | "quota-reached"
  | "network-error";

/** What the evaluator believed was covered. Used only to close an older miss. */
export interface CoverageResult {
  covered: string[];
  skipped: string[];
}

export type GradeOutcome =
  | {
      status: "graded";
      miss: Omit<SpokenMiss, "id" | "status" | "resolvedAt" | "resolvedBy">;
      coverage: CoverageResult;
      calls: OutboundCall[];
    }
  | {
      /**
       * The evaluator found nothing worth flagging, and the coverage pass
       * independently agreed that no key point was skipped. Forcing a miss on
       * a complete answer would manufacture exactly the false miss this
       * project exists to avoid.
       */
      status: "clean";
      coverage: CoverageResult;
      models: { coverage: string; judgment: string };
      calls: OutboundCall[];
    }
  | {
      /**
       * The evaluator answered but could not support it. Shown to the user as a
       * refusal rather than hidden: declining to fabricate is the point.
       */
      status: "rejected";
      reason: GradeRejectionReason;
      detail: string;
      calls: OutboundCall[];
    }
  | { status: "failed"; reason: GradeFailureReason; detail: string; calls: OutboundCall[] }
  | { status: "skipped"; reason: "empty-transcript"; calls: [] };

/**
 * Running tally across every grade ever attempted in this browser.
 * Surfaced in the UI: "declined 3 of 41 grades it could not support" is a more
 * honest and more interesting claim than a success rate.
 */
export interface GradeStats {
  attempted: number;
  accepted: number;
  /** Graded with no miss, confirmed by both passes. */
  clean: number;
  rejected: number;
  failed: number;
}

// --- scheduling and progress ------------------------------------------------

export interface TopicProgress {
  topicId: string;
  attempts: number;
  lastAttemptAt: string | null;
  /** 0-100, derived from recent ratings. */
  mastery: number;
  /** SM-2 ease factor, 1.3 to 2.8. */
  ease: number;
  intervalDays: number;
  dueAt: string | null;
}

/** Why a topic is on today's plan. Rendered on the card, not just used to sort. */
export type PlanSlot = "open-miss" | "due-review" | "new" | "cold-track" | "wildcard";

export interface PlanEntry {
  topicId: string;
  slot: PlanSlot;
  /** One line shown under the card, e.g. the open miss label. */
  reason: string;
}

// --- settings and persisted state -------------------------------------------

export interface Settings {
  theme: "dark" | "light";
  reduceMotion: boolean;
  timerSeconds: 30 | 45 | 60 | 90;
  planSize: number; // 2-6
  /**
   * Optional user-supplied Token Factory key, used only when the shared demo
   * quota is exhausted. Forwarded per request and never persisted server side.
   */
  ownApiKey: string;
}

export const SCHEMA_VERSION = 1;

export interface AppState {
  schemaVersion: number;
  attempts: Attempt[];
  progress: Record<string, TopicProgress>;
  misses: SpokenMiss[];
  /** Per-topic research notes. */
  notes: Record<string, string>;
  /** Topics added through rubric import. */
  importedTopics: Topic[];
  gradeStats: GradeStats;
  settings: Settings;
}
