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

/** The two roles the coach session asks the candidate to pick. */
export type RoleTrack = "ai-engineer" | "applied-ai";

/**
 * How strong the evidence is that this question type is actually assessed.
 * Official: a company job description or interview guide names the competency.
 * Reported: a candidate account describes the question type.
 * Community: a curated open question bank.
 * None of these mean a named company asked this exact wording.
 */
export type SourceLabel = "official" | "reported" | "community";

/** Second-person rubric review. Pending until someone other than the author signs it. */
export type RubricReview = { status: "pending" } | { status: "reviewed"; reviewer: string };

export const TRACK_LABELS: Record<Track, string> = {
  agentic: "Agentic AI",
  "system-design": "System design",
  "llm-core": "LLM core",
  swe: "Software engineering",
};

export const ROLE_LABELS: Record<RoleTrack, string> = {
  "ai-engineer": "AI Engineer",
  "applied-ai": "Applied AI Engineer",
};

export const SOURCE_LABELS: Record<SourceLabel, string> = {
  official: "Official",
  reported: "Reported",
  community: "Community",
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
  /**
   * Role tracks this question is written for. Absent on the older catalog,
   * which the eval fixtures still grade.
   */
  roles?: RoleTrack[];
  /** Stable tags. A question and its twin share the tags a miss can close on. */
  competencies?: string[];
  /** Strength of the source. See SourceLabel. */
  sourceLabel?: SourceLabel;
  /** What that source actually says, plus a URL a judge can open. */
  sourceNote?: string;
  /** Other question ids that test the same claims under a different framing. */
  twinIds?: string[];
  /** Whether a second person has reviewed the rubric. */
  rubricReview?: RubricReview;
  /**
   * What the framing actually asks for, one entry per part. An answer that
   * never speaks to a part did not answer the question, however good it was.
   */
  parts?: string[];
  /** Two skills the question tests, each with four written levels. */
  skills?: SkillRubric[];
}

/**
 * A skill with four written levels, lowest first. The levels describe what an
 * answer at that level sounds like, so a model, a human, and the candidate
 * are all judging against the same words.
 */
export interface SkillRubric {
  name: string;
  levels: [string, string, string, string];
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
  provider: "token-factory" | "replay";
  model: string;
  purpose:
    | "coverage"
    | "judgment"
    | "lines-nano"
    | "lines-ultra"
    | "extract"
    | "rate-nano"
    | "rate-ultra"
    | "repair";
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
  | "network-error"
  | "grade-error"
  | "extract-error"
  | "repair-error";

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

// --- parallel grading -------------------------------------------------------

export type GraderId = "nano" | "ultra";

export type LineStatus = "covered" | "missed";

/** One model's verdict on one key point, after the citation gate. */
export interface LineVerdict {
  line: string;
  status: LineStatus;
  /** Verbatim from the transcript. Always present when covered. */
  quote: string | null;
}

export type CombinedStatus = "covered" | "missed" | "disputed";

export interface CombinedLine {
  line: string;
  status: CombinedStatus;
  /** Null when that model's call failed, so only one opinion exists. */
  nano: LineVerdict | null;
  ultra: LineVerdict | null;
}

/** The one miss the results screen leads with. */
export interface HeadlineMiss {
  rubricLine: string;
  quote: string;
  missType: string;
  category: MissCategory;
  plainLanguage: string;
  from: GraderId;
}

export type ParallelOutcome =
  | {
      status: "graded";
      lines: CombinedLine[];
      /** Null when no gated headline landed on a line both models call missed. */
      headline: HeadlineMiss | null;
      models: { nano: string | null; ultra: string | null };
      /** True when one model failed and every line carries a single opinion. */
      partial: boolean;
      /** True when the result came from a saved recording, not a live call. */
      replay: boolean;
      calls: OutboundCall[];
    }
  | { status: "failed"; reason: GradeFailureReason; detail: string; calls: OutboundCall[] }
  | { status: "skipped"; reason: "empty-transcript"; calls: [] };

// --- rated answers ----------------------------------------------------------

export const RELEVANCE = ["on-question", "related", "off-topic"] as const;
export type Relevance = (typeof RELEVANCE)[number];

/**
 * Justified is correct plus the reason or tradeoff, in the candidate's words.
 * That is the difference interviewers reward, so it is its own label.
 */
export const QUALITY = ["wrong", "vague", "correct", "justified"] as const;
export type Quality = (typeof QUALITY)[number];

export const RELEVANCE_LABELS: Record<Relevance, string> = {
  "on-question": "On the question",
  related: "Related",
  "off-topic": "Off-topic",
};

export const QUALITY_LABELS: Record<Quality, string> = {
  wrong: "Wrong",
  vague: "Vague",
  correct: "Correct",
  justified: "Justified",
};

export type SkillLevel = 1 | 2 | 3 | 4;

/** One point the candidate made: an exact fragment of the transcript. */
export interface AnswerPoint {
  id: string;
  quote: string;
}

export interface PartRating {
  part: string;
  addressed: boolean;
  /** Verbatim from the transcript. Always present when addressed. */
  quote: string | null;
}

export interface PointRating {
  id: string;
  relevance: Relevance;
  quality: Quality;
  /** A supplied key point, copied exactly, or null. */
  rubricLine: string | null;
  reason: string;
}

export interface SkillRating {
  skill: string;
  level: SkillLevel;
}

/** The one key point to lead with. The quote is the words closest to it. */
export interface Gap {
  rubricLine: string;
  quote: string;
  missType: string;
  category: MissCategory;
  plainLanguage: string;
}

/** One model's rating after the gate. */
export interface ModelRating {
  parts: PartRating[];
  /** Keyed by point id. A point the model did not rate validly is absent. */
  points: Record<string, PointRating>;
  skills: SkillRating[];
  gap: Gap | null;
}

export type PartStatus = "addressed" | "not-addressed" | "disputed";

export interface CombinedPart {
  part: string;
  status: PartStatus;
  nano: PartRating | null;
  ultra: PartRating | null;
}

export interface CombinedPoint {
  point: AnswerPoint;
  /** Set only when every model that answered gave the same label. */
  relevance: Relevance | null;
  quality: Quality | null;
  rubricLine: string | null;
  disputed: boolean;
  nano: PointRating | null;
  ultra: PointRating | null;
}

export interface CombinedSkill {
  skill: SkillRubric;
  nano: SkillLevel | null;
  ultra: SkillLevel | null;
}

export type RatedOutcome =
  | {
      status: "graded";
      parts: CombinedPart[];
      points: CombinedPoint[];
      skills: CombinedSkill[];
      /** Null when the models did not name the same gap, or nothing was missing. */
      gap: (Gap & { from: GraderId }) | null;
      /** Each model's own gap after the gate. Absent on sessions saved before it was kept. */
      gaps?: { nano: Gap | null; ultra: Gap | null };
      /** Key points supported by a point both models rate justified. */
      supported: string[];
      models: { extract: string | null; nano: string | null; ultra: string | null };
      partial: boolean;
      replay: boolean;
      calls: OutboundCall[];
    }
  | { status: "failed"; reason: GradeFailureReason; detail: string; calls: OutboundCall[] }
  | { status: "skipped"; reason: "empty-transcript"; calls: [] };

/** The candidate's decision on a disputed line or question part. Stored as a human label. */
export interface DisputeLabel {
  id: string;
  at: string;
  topicId: string;
  attemptId: string | null;
  /** Absent on labels stored before parts existed, which were all rubric lines. */
  kind?: "line" | "part";
  line: string;
  /** For a part, covered means addressed. */
  decision: LineStatus;
  nano: LineStatus | null;
  ultra: LineStatus | null;
  transcript: string;
}

// --- interviewer ------------------------------------------------------------

export type InterviewerTool = "pickNextQuestion" | "getRubric" | "pickFollowUp";

export interface TraceEntry {
  at: string;
  tool: InterviewerTool;
  ok: boolean;
  /** True when the fixed rule ran because the tool failed or returned junk. */
  fallback: boolean;
  /** One short line shown in the UI. */
  reason: string;
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
  /** Serve saved model responses instead of calling the API. Labelled in the UI. */
  replayMode: boolean;
}

export const SCHEMA_VERSION = 2;

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
  /** Candidate decisions on disputed lines. */
  labels: DisputeLabel[];
  settings: Settings;
}
