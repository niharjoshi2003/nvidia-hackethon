/**
 * The full read of a graded answer: what each model concluded, why, on which
 * parameters, and where the two models part ways.
 *
 * Each model is scored on its own ratings only. The two scores are never
 * averaged into one number: the consensus is the band both models land in,
 * and when they land in different bands the lower one stands and the split
 * is shown.
 */

import type {
  CombinedPoint,
  Gap,
  GraderId,
  PointRating,
  Quality,
  RatedOutcome,
  Relevance,
  Topic,
} from "@/types";

export type GradedOutcome = Extract<RatedOutcome, { status: "graded" }>;

export const GRADERS: readonly GraderId[] = ["nano", "ultra"];

export const GRADER_LABELS: Record<GraderId, string> = { nano: "Nano", ultra: "Ultra" };

// --- parameters -------------------------------------------------------------

export type ParameterId = "parts" | "points" | "keyPoints" | "skills";

export interface ParameterSpec {
  id: ParameterId;
  label: string;
  weight: number;
  /** What the parameter measures, shown beside the score. */
  question: string;
  /** How the number is computed, in one line. */
  method: string;
}

export const PARAMETERS: readonly ParameterSpec[] = [
  {
    id: "parts",
    label: "Answered the question",
    weight: 0.4,
    question: "Did you speak to every part of what was asked?",
    method: "Question parts the model marked addressed, each backed by a quote from you.",
  },
  {
    id: "points",
    label: "Quality of what you said",
    weight: 0.3,
    question: "Were your points accurate, specific, and reasoned?",
    method:
      "Each point: wrong 0, vague 1/3, correct 2/3, justified 1; halved when only related, zero when off-topic.",
  },
  {
    id: "keyPoints",
    label: "Key ideas covered",
    weight: 0.15,
    question: "Did you land the ideas an interviewer listens for?",
    method: "Key points supported by at least one of your correct or justified points.",
  },
  {
    id: "skills",
    label: "Skill level",
    weight: 0.15,
    question: "Where does the whole answer sit on the written skill levels?",
    method: "Mean of the skill levels, 1 to 4, scaled so level 1 is 0 and level 4 is 100.",
  },
];

export const QUALITY_VALUE: Record<Quality, number> = {
  wrong: 0,
  vague: 1 / 3,
  correct: 2 / 3,
  justified: 1,
};

export const RELEVANCE_WEIGHT: Record<Relevance, number> = {
  "on-question": 1,
  related: 0.5,
  "off-topic": 0,
};

const QUALITY_STEP: Record<Quality, number> = { wrong: 0, vague: 1, correct: 2, justified: 3 };

const isCredited = (r: PointRating) =>
  (r.quality === "correct" || r.quality === "justified") && r.relevance !== "off-topic";

export const pointValue = (r: PointRating) => QUALITY_VALUE[r.quality] * RELEVANCE_WEIGHT[r.relevance];

// --- verdict bands ----------------------------------------------------------

export type VerdictBand = "strong" | "solid" | "developing" | "not-yet";

const BAND_ORDER: readonly VerdictBand[] = ["not-yet", "developing", "solid", "strong"];

export const BAND_LABELS: Record<VerdictBand, string> = {
  strong: "Strong",
  solid: "Solid",
  developing: "Developing",
  "not-yet": "Not yet",
};

export const BAND_MEANING: Record<VerdictBand, string> = {
  strong: "An interviewer would likely move you forward on this answer.",
  solid: "A fair answer with a visible hole an interviewer would probe.",
  developing: "Parts of the question went unanswered or stayed vague.",
  "not-yet": "The answer does not yet address what was asked.",
};

export function bandFor(score: number): VerdictBand {
  if (score >= 80) return "strong";
  if (score >= 60) return "solid";
  if (score >= 40) return "developing";
  return "not-yet";
}

export const lowerBand = (a: VerdictBand, b: VerdictBand) =>
  BAND_ORDER.indexOf(a) <= BAND_ORDER.indexOf(b) ? a : b;

// --- one model's verdict ----------------------------------------------------

export interface ParameterScore extends ParameterSpec {
  /** 0 to 100, or null when the parameter does not apply to this question. */
  score: number | null;
  /** The counts behind the score, e.g. "2 of 3 parts". */
  detail: string;
}

export interface PointNote {
  point: CombinedPoint["point"];
  rating: PointRating;
}

export interface ModelVerdict {
  grader: GraderId;
  model: string | null;
  answered: boolean;
  score: number | null;
  band: VerdictBand | null;
  parameters: ParameterScore[];
  qualityMix: Record<Quality, number>;
  relevanceMix: Record<Relevance, number>;
  /** Points this model rated, of the points extracted. */
  rated: number;
  strongest: PointNote | null;
  weakest: PointNote | null;
  gap: Gap | null;
  /** A plain sentence summarising this model's reading of the answer. */
  summary: string;
}

const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 100));

function ratingsOf(outcome: GradedOutcome, grader: GraderId): PointNote[] {
  return outcome.points.flatMap((p) => (p[grader] ? [{ point: p.point, rating: p[grader]! }] : []));
}

export function modelVerdict(topic: Topic, outcome: GradedOutcome, grader: GraderId): ModelVerdict {
  const model = outcome.models[grader];
  const answered = model !== null || outcome.points.some((p) => p[grader] !== null);
  const notes = ratingsOf(outcome, grader);
  const keyPoints = topic.scaffold.keyPoints;

  const parts = outcome.parts.map((p) => p[grader]);
  const addressed = parts.filter((p) => p?.addressed).length;

  const values = notes.map((n) => pointValue(n.rating));
  const meanValue = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

  const supportedLines = new Set(
    notes.filter((n) => isCredited(n.rating) && n.rating.rubricLine).map((n) => n.rating.rubricLine!),
  );
  const keyHit = keyPoints.filter((k) => supportedLines.has(k)).length;

  const levels = outcome.skills.map((s) => s[grader]).filter((l): l is NonNullable<typeof l> => l !== null);
  const meanLevel = levels.length ? levels.reduce<number>((a, b) => a + b, 0) / levels.length : null;

  const scores: Record<ParameterId, { score: number | null; detail: string }> = {
    parts: {
      score: outcome.parts.length ? pct(addressed, outcome.parts.length) : null,
      detail: `${addressed} of ${outcome.parts.length} part${outcome.parts.length === 1 ? "" : "s"} addressed`,
    },
    points: {
      score: notes.length ? Math.round(meanValue * 100) : null,
      detail: `${notes.length} point${notes.length === 1 ? "" : "s"} rated`,
    },
    keyPoints: {
      score: keyPoints.length ? pct(keyHit, keyPoints.length) : null,
      detail: `${keyHit} of ${keyPoints.length} key points supported`,
    },
    skills: {
      score: meanLevel === null ? null : Math.round(((meanLevel - 1) / 3) * 100),
      detail:
        meanLevel === null
          ? "no skill levels returned"
          : `average level ${meanLevel.toFixed(1)} of 4 across ${levels.length} skill${levels.length === 1 ? "" : "s"}`,
    },
  };

  const parameters: ParameterScore[] = PARAMETERS.map((spec) => ({ ...spec, ...scores[spec.id] }));
  const applicable = parameters.filter((p) => p.score !== null);
  const weightSum = applicable.reduce((a, p) => a + p.weight, 0);
  const score =
    answered && weightSum > 0
      ? Math.round(applicable.reduce((a, p) => a + p.weight * (p.score as number), 0) / weightSum)
      : null;

  const qualityMix: Record<Quality, number> = { wrong: 0, vague: 0, correct: 0, justified: 0 };
  const relevanceMix: Record<Relevance, number> = { "on-question": 0, related: 0, "off-topic": 0 };
  for (const n of notes) {
    qualityMix[n.rating.quality] += 1;
    relevanceMix[n.rating.relevance] += 1;
  }

  const byValue = [...notes].sort((a, b) => pointValue(b.rating) - pointValue(a.rating));
  const strongest = byValue[0] && pointValue(byValue[0].rating) > 0 ? byValue[0] : null;
  const last = byValue.at(-1);
  const weakest = last && last !== strongest && pointValue(last.rating) < 2 / 3 ? last : null;

  const gap = outcome.gaps?.[grader] ?? (outcome.gap?.from === grader ? outcome.gap : null);
  const band = score === null ? null : bandFor(score);

  return {
    grader,
    model,
    answered,
    score,
    band,
    parameters,
    qualityMix,
    relevanceMix,
    rated: notes.length,
    strongest,
    weakest,
    gap,
    summary: summarise(grader, { addressed, parts: outcome.parts.length, qualityMix, keyHit, keyPoints: keyPoints.length, band, answered }),
  };
}

function summarise(
  grader: GraderId,
  s: {
    addressed: number;
    parts: number;
    qualityMix: Record<Quality, number>;
    keyHit: number;
    keyPoints: number;
    band: VerdictBand | null;
    answered: boolean;
  },
): string {
  const name = GRADER_LABELS[grader];
  if (!s.answered || !s.band) return `${name} did not return a usable rating.`;
  const credited = s.qualityMix.correct + s.qualityMix.justified;
  const weak = s.qualityMix.vague + s.qualityMix.wrong;
  return (
    `${name} reads this as ${BAND_LABELS[s.band].toLowerCase()}: ${s.addressed} of ${s.parts} question ` +
    `part${s.parts === 1 ? "" : "s"} addressed, ${credited} point${credited === 1 ? "" : "s"} credited ` +
    `against ${weak} vague or wrong, and ${s.keyHit} of ${s.keyPoints} key ideas landed.`
  );
}

// --- consensus --------------------------------------------------------------

export interface Consensus {
  band: VerdictBand | null;
  /** True when both models answered and landed in the same band. */
  agreed: boolean;
  /** True when only one model answered. */
  single: boolean;
  scores: Partial<Record<GraderId, number>>;
  headline: string;
  explanation: string;
}

export function consensus(verdicts: readonly ModelVerdict[]): Consensus {
  const live = verdicts.filter((v) => v.band !== null && v.score !== null);
  const scores = Object.fromEntries(live.map((v) => [v.grader, v.score as number]));

  if (live.length === 0) {
    return {
      band: null,
      agreed: false,
      single: false,
      scores,
      headline: "No verdict",
      explanation: "Neither model returned a rating that passed the checks.",
    };
  }

  if (live.length === 1) {
    const only = live[0]!;
    return {
      band: only.band,
      agreed: false,
      single: true,
      scores,
      headline: BAND_LABELS[only.band!],
      explanation: `Only ${GRADER_LABELS[only.grader]} answered, so this rests on one opinion. ${BAND_MEANING[only.band!]}`,
    };
  }

  const [a, b] = live as [ModelVerdict, ModelVerdict];
  if (a.band === b.band) {
    return {
      band: a.band,
      agreed: true,
      single: false,
      scores,
      headline: BAND_LABELS[a.band!],
      explanation: `Both models independently land on ${BAND_LABELS[a.band!].toLowerCase()} (${a.score} and ${b.score}). ${BAND_MEANING[a.band!]}`,
    };
  }

  const band = lowerBand(a.band!, b.band!);
  const harsher = band === a.band ? a : b;
  const softer = harsher === a ? b : a;
  return {
    band,
    agreed: false,
    single: false,
    scores,
    headline: `${BAND_LABELS[band]} (split decision)`,
    explanation:
      `${GRADER_LABELS[softer.grader]} says ${BAND_LABELS[softer.band!].toLowerCase()} (${softer.score}), ` +
      `${GRADER_LABELS[harsher.grader]} says ${BAND_LABELS[harsher.band!].toLowerCase()} (${harsher.score}). ` +
      `When they split, the stricter reading stands, so you are not credited for something only one model saw.`,
  };
}

// --- model vs model ---------------------------------------------------------

export interface AgreementRow {
  id: "parts" | "relevance" | "quality" | "rubricLine" | "skills" | "gap";
  label: string;
  agree: number;
  total: number;
  /** For ordinal labels: how many were within one step. */
  near?: number;
}

export interface Comparison {
  /** False when only one model answered; nothing to compare. */
  available: boolean;
  rows: AgreementRow[];
  overall: { agree: number; total: number };
  /** Which model rates quality lower on the points both rated, and by how many steps on average. */
  stricter: { grader: GraderId; steps: number } | null;
  /** Points where the models disagree on relevance or quality. */
  splits: CombinedPoint[];
}

export function compareModels(outcome: GradedOutcome): Comparison {
  const both = outcome.points.filter((p) => p.nano && p.ultra);
  const partsBoth = outcome.parts.filter((p) => p.nano && p.ultra);
  const skillsBoth = outcome.skills.filter((s) => s.nano !== null && s.ultra !== null);
  const available = outcome.models.nano !== null && outcome.models.ultra !== null && (both.length > 0 || partsBoth.length > 0);

  const count = <T,>(items: T[], same: (t: T) => boolean) => items.filter(same).length;

  const rows: AgreementRow[] = [
    {
      id: "parts",
      label: "Which question parts you addressed",
      agree: count(partsBoth, (p) => p.nano!.addressed === p.ultra!.addressed),
      total: partsBoth.length,
    },
    {
      id: "relevance",
      label: "Whether each point was on the question",
      agree: count(both, (p) => p.nano!.relevance === p.ultra!.relevance),
      total: both.length,
    },
    {
      id: "quality",
      label: "How good each point was",
      agree: count(both, (p) => p.nano!.quality === p.ultra!.quality),
      total: both.length,
      near: count(both, (p) => Math.abs(QUALITY_STEP[p.nano!.quality] - QUALITY_STEP[p.ultra!.quality]) <= 1),
    },
    {
      id: "rubricLine",
      label: "Which key idea each point supports",
      agree: count(both, (p) => p.nano!.rubricLine === p.ultra!.rubricLine),
      total: both.length,
    },
    {
      id: "skills",
      label: "Skill levels",
      agree: count(skillsBoth, (s) => s.nano === s.ultra),
      total: skillsBoth.length,
      near: count(skillsBoth, (s) => Math.abs(s.nano! - s.ultra!) <= 1),
    },
  ];

  if (outcome.gaps) {
    const n = outcome.gaps.nano?.rubricLine ?? null;
    const u = outcome.gaps.ultra?.rubricLine ?? null;
    rows.push({ id: "gap", label: "The one thing most missing", agree: n === u ? 1 : 0, total: 1 });
  }

  const scored = rows.filter((r) => r.total > 0);
  const overall = {
    agree: scored.reduce((a, r) => a + r.agree, 0),
    total: scored.reduce((a, r) => a + r.total, 0),
  };

  let stricter: Comparison["stricter"] = null;
  if (both.length > 0) {
    const diff =
      both.reduce((a, p) => a + QUALITY_STEP[p.nano!.quality] - QUALITY_STEP[p.ultra!.quality], 0) / both.length;
    if (Math.abs(diff) >= 0.25) stricter = { grader: diff > 0 ? "ultra" : "nano", steps: Math.abs(diff) };
  }

  return {
    available,
    rows,
    overall,
    stricter,
    splits: outcome.points.filter((p) => p.disputed),
  };
}

// --- key points ---------------------------------------------------------------

export type KeyPointStatus = "supported" | "weak" | "absent";

export interface KeyPointRow {
  line: string;
  nano: { status: KeyPointStatus; pointIds: string[] } | null;
  ultra: { status: KeyPointStatus; pointIds: string[] } | null;
  /** True when this key point is the gap a model named. */
  gapFor: GraderId[];
}

export function keyPointCoverage(topic: Topic, outcome: GradedOutcome): KeyPointRow[] {
  const forGrader = (grader: GraderId, line: string) => {
    if (outcome.models[grader] === null && !outcome.points.some((p) => p[grader])) return null;
    const mapped = ratingsOf(outcome, grader).filter((n) => n.rating.rubricLine === line);
    const status: KeyPointStatus = mapped.some((n) => isCredited(n.rating))
      ? "supported"
      : mapped.length > 0
        ? "weak"
        : "absent";
    return { status, pointIds: mapped.map((n) => n.point.id) };
  };

  return topic.scaffold.keyPoints.map((line) => ({
    line,
    nano: forGrader("nano", line),
    ultra: forGrader("ultra", line),
    gapFor: GRADERS.filter((g) => outcome.gaps?.[g]?.rubricLine === line),
  }));
}

// --- whole analysis -------------------------------------------------------------

export interface Analysis {
  verdicts: ModelVerdict[];
  consensus: Consensus;
  comparison: Comparison;
  keyPoints: KeyPointRow[];
}

export function analyse(topic: Topic, outcome: GradedOutcome): Analysis {
  const verdicts = GRADERS.map((g) => modelVerdict(topic, outcome, g));
  return {
    verdicts,
    consensus: consensus(verdicts),
    comparison: compareModels(outcome),
    keyPoints: keyPointCoverage(topic, outcome),
  };
}
