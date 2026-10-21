/**
 * The interview thread: turn views, the planner that picks the next question,
 * and the scorecard that adds the turns up.
 *
 * Everything here is deterministic and pure. No model is called to choose a
 * question; the planner reads what earlier turns were rated as and applies
 * written rules. Each turn is graded by the same pipeline as a single answer,
 * handed a narrowed view of the topic (only the lines that turn asked about),
 * so the citation gate and the two-model combine step are unchanged.
 */

import {
  analyse,
  bandFor,
  compareModels,
  keyPointCoverage,
  lowerBand,
  type GradedOutcome,
  type VerdictBand,
} from "@/lib/analysis";
import { wordCount } from "@/lib/text";
import { spokenPrompt, type MicroQuestion, type ThreadDef, type TurnKind } from "@/data/threads";
import type { Gap, GraderId, RatedOutcome, SkillRubric, Topic } from "@/types";

/** Five short turns is about five minutes. The planner never asks more. */
export const MAX_TURNS = 5;

export interface PlannedTurn {
  /** Unique within a thread. Micro-question id, or `why-<n>` for a probe. */
  id: string;
  kind: TurnKind;
  /** The whole question, as shown and as read aloud. */
  prompt: string;
  /** The rubric lines this turn is graded on, copied exactly from the topic. */
  targets: string[];
  seconds: number;
  skill: 0 | 1 | null;
  /** What the question asks for, as the one part the graders must find. */
  part: string;
  /** Why the interviewer chose this question, shown beside it. */
  reason: string;
  /** For a why-probe: the candidate's own words being asked about. */
  quoted?: string;
}

/** A turn that has been answered. The outcome is null while the models are still rating it. */
export interface TurnRecord {
  turn: PlannedTurn;
  transcript: string;
  spokenSeconds: number;
  outcome: RatedOutcome | null;
  at: string;
}

export interface AskedTurn {
  turn: PlannedTurn;
  outcome: RatedOutcome | null;
}

const isGraded = (o: RatedOutcome | null | undefined): o is GradedOutcome => o?.status === "graded";

// --- the narrowed topic a turn is graded against ---------------------------------

/** The four things about a turn that grading reads. Saved with the round so history redraws exactly. */
export interface TopicView {
  framing: string;
  parts: string[];
  skills: SkillRubric[];
  keyPoints: string[];
}

export function viewOfTurn(topic: Topic, turn: Pick<PlannedTurn, "prompt" | "part" | "skill" | "targets">): TopicView {
  const skill = turn.skill === null ? undefined : topic.skills?.[turn.skill];
  return {
    framing: turn.prompt,
    parts: [turn.part],
    skills: skill ? [skill] : [],
    keyPoints: turn.targets,
  };
}

export function applyView(topic: Topic, view: TopicView, turnId?: string): Topic {
  return {
    ...topic,
    id: turnId ? `${topic.id}#${turnId}` : topic.id,
    framing: view.framing,
    parts: view.parts,
    skills: view.skills,
    scaffold: { ...topic.scaffold, keyPoints: view.keyPoints },
  };
}

/** The topic as one turn sees it. Its id is derived, so it never collides with the real topic. */
export function turnTopic(topic: Topic, turn: PlannedTurn): Topic {
  return applyView(topic, viewOfTurn(topic, turn), turn.id);
}

// --- building turns ----------------------------------------------------------------

function fromMicro(m: MicroQuestion, topic: Topic, reason: string): PlannedTurn {
  return {
    id: m.id,
    kind: m.kind,
    prompt: spokenPrompt(m),
    targets: m.targets.map((i) => topic.scaffold.keyPoints[i]).filter((l): l is string => Boolean(l)),
    seconds: m.seconds,
    skill: m.skill,
    part: m.part,
    reason,
  };
}

const clip = (text: string, max: number) => {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 40 ? cut.lastIndexOf(" ") : max)}…`;
};

/**
 * A turn rebuilt from a saved round, for drawing a past session. Only the fields
 * that grading and the scorecard read are recovered; the saved view is the truth.
 */
export function turnFromSaved(
  topic: Topic,
  saved: { kind: TurnKind; prompt: string; view: TopicView },
  index: number,
): PlannedTurn {
  const name = saved.view.skills[0]?.name;
  const found = name ? (topic.skills?.findIndex((s) => s.name === name) ?? -1) : -1;
  return {
    id: `saved-${index}`,
    kind: saved.kind,
    prompt: saved.prompt,
    targets: saved.view.keyPoints,
    seconds: 0,
    skill: found === 0 || found === 1 ? found : null,
    part: saved.view.parts[0] ?? "",
    reason: "",
  };
}

const OPENER_REASON = "The opening question: one slice of the design, small enough to answer well in a minute.";
const SECOND_REASON = "Next, one decision the design turns on, so you are asked to pick a side.";

export function openingTurn(def: ThreadDef, topic: Topic): PlannedTurn {
  return fromMicro(def.micros[0]!, topic, OPENER_REASON);
}

// --- coverage -----------------------------------------------------------------------

export type CellState = "landed" | "partial" | "touched" | "missed" | "unrated" | "pending";
export type LineStatus = CellState | "not-asked";

const RANK: Record<CellState, number> = { landed: 5, partial: 4, touched: 3, missed: 2, unrated: 1, pending: 0 };

export interface CoverageRow {
  line: string;
  index: number;
  status: LineStatus;
  /** One entry per turn that asked about this line. */
  cells: Array<{ turn: number; state: CellState }>;
}

export interface ScoredTurn {
  turn: PlannedTurn;
  outcome: RatedOutcome | null;
}

function cellState(view: Topic, outcome: RatedOutcome | null, line: string): CellState {
  if (outcome === null) return "pending";
  if (!isGraded(outcome)) return "unrated";
  const row = keyPointCoverage(view, outcome).find((r) => r.line === line);
  const statuses = [row?.nano?.status, row?.ultra?.status].filter((s): s is NonNullable<typeof s> => Boolean(s));
  if (statuses.length === 0) return "unrated";
  if (statuses.every((s) => s === "supported")) return "landed";
  if (statuses.some((s) => s === "supported")) return "partial";
  if (statuses.some((s) => s === "weak")) return "touched";
  return "missed";
}

export function coverageFor(topic: Topic, turns: readonly ScoredTurn[]): CoverageRow[] {
  return topic.scaffold.keyPoints.map((line, index) => {
    const cells: CoverageRow["cells"] = [];
    turns.forEach((t, turnIndex) => {
      if (!t.turn.targets.includes(line)) return;
      cells.push({ turn: turnIndex, state: cellState(turnTopic(topic, t.turn), t.outcome, line) });
    });
    const best = cells.reduce<CellState | null>(
      (acc, c) => (acc === null || RANK[c.state] > RANK[acc] ? c.state : acc),
      null,
    );
    return { line, index, status: best ?? "not-asked", cells };
  });
}

// --- planning -------------------------------------------------------------------------

/** A correct point the candidate made without giving a reason, worth one "why?". */
function whyCandidate(
  asked: readonly AskedTurn[],
): { line: string; quote: string; fromSkill: PlannedTurn["skill"] } | null {
  const probed = new Set(asked.filter((a) => a.turn.kind === "why").flatMap((a) => a.turn.targets));
  const justified = new Set(asked.flatMap((a) => (isGraded(a.outcome) ? a.outcome.supported : [])));

  for (const a of [...asked].reverse()) {
    if (!isGraded(a.outcome)) continue;
    const found = a.outcome.points.find(
      (p) =>
        p.quality === "correct" &&
        p.relevance === "on-question" &&
        !p.disputed &&
        p.rubricLine !== null &&
        !justified.has(p.rubricLine) &&
        !probed.has(p.rubricLine) &&
        wordCount(p.point.quote) >= 6,
    );
    if (found?.rubricLine) return { line: found.rubricLine, quote: found.point.quote, fromSkill: a.turn.skill };
  }
  return null;
}

/**
 * The next question, or null when the thread is over.
 *
 * Turns one and two are authored and fixed, because nothing has been rated by
 * the time they are chosen. From turn three the planner reads whatever ratings
 * have arrived and:
 *   1. asks "why?" about one correct point that came with no reason,
 *   2. otherwise asks the unused question that targets the most important idea
 *      not yet landed,
 *   3. otherwise, once the core ideas have landed, asks a spot-the-flaw.
 * With no ratings yet it falls back to the authored order.
 */
export function planNextTurn(def: ThreadDef, topic: Topic, asked: readonly AskedTurn[]): PlannedTurn | null {
  if (asked.length >= MAX_TURNS) return null;

  const used = new Set(asked.map((a) => a.turn.id));
  const unused = def.micros.filter((m) => !used.has(m.id));
  const n = asked.length;

  if (n < 2) {
    const next = unused[0];
    return next ? fromMicro(next, topic, n === 0 ? OPENER_REASON : SECOND_REASON) : null;
  }

  const haveRatings = asked.some((a) => isGraded(a.outcome));
  if (!haveRatings) {
    const next = unused[0];
    return next ? fromMicro(next, topic, "The next question in the thread. No ratings were available yet to adapt it.") : null;
  }

  if (n <= 3 && !asked.some((a) => a.turn.kind === "why")) {
    const why = whyCandidate(asked);
    if (why) {
      return {
        id: `why-${n}`,
        kind: "why",
        prompt: `Earlier you said: “${clip(why.quote, 140)}”. Why that choice, and what goes wrong with the obvious alternative?`,
        targets: [why.line],
        seconds: 30,
        skill: why.fromSkill,
        part: "Give the reason behind a point you made",
        reason: "You made that point without saying why. An interviewer would ask.",
        quoted: why.quote,
      };
    }
  }

  const coverage = coverageFor(topic, asked);
  const weight = (line: string) => {
    const row = coverage.find((r) => r.line === line);
    // A targeted line still waiting for its rating counts as covered; do not ask it twice.
    if (!row || row.status === "landed" || row.status === "pending") return 0;
    return coverage.length - row.index;
  };

  const ranked = unused
    .map((m) => {
      const lines = m.targets.map((i) => topic.scaffold.keyPoints[i]).filter((l): l is string => Boolean(l));
      return { m, lines, score: lines.reduce((sum, l) => sum + weight(l), 0) };
    })
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (best && best.score > 0) {
    const lead = [...best.lines].sort((a, b) => weight(b) - weight(a))[0]!;
    const status = coverage.find((r) => r.line === lead)?.status;
    const reason =
      status === "not-asked"
        ? `A part of the design we have not touched yet: “${lead}”`
        : `That idea has not fully landed yet: “${lead}”`;
    return fromMicro(best.m, topic, reason);
  }

  const flaw = unused.find((m) => m.kind === "flaw") ?? unused[0];
  return flaw
    ? fromMicro(flaw, topic, "Nothing from your earlier answers is still open, so this checks whether you can spot a common mistake.")
    : null;
}

// --- the scorecard ----------------------------------------------------------------------

export interface TurnScore {
  index: number;
  kind: TurnKind;
  nano: number | null;
  ultra: number | null;
  band: VerdictBand | null;
  rated: boolean;
}

export interface ThreadSkill {
  name: string;
  nano: number | null;
  ultra: number | null;
  /** The written level closest to the mean of whichever models answered. */
  description: string | null;
}

export interface Scorecard {
  coverage: CoverageRow[];
  skills: ThreadSkill[];
  turns: TurnScore[];
  overall: {
    nano: number | null;
    ultra: number | null;
    band: VerdictBand | null;
    agreed: boolean;
    single: boolean;
  };
  /** The one gap both models named and no later turn closed. */
  gap: (Gap & { from: GraderId }) | null;
  gapTurn: number | null;
  agreement: { agree: number; total: number } | null;
  asked: number;
  rated: number;
  /** Lines a point both models rated justified supported, across all turns. */
  supported: string[];
}

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

export function buildScorecard(topic: Topic, turns: readonly ScoredTurn[]): Scorecard {
  const coverage = coverageFor(topic, turns);

  const scores: TurnScore[] = turns.map((t, index) => {
    if (!isGraded(t.outcome)) return { index, kind: t.turn.kind, nano: null, ultra: null, band: null, rated: false };
    const a = analyse(turnTopic(topic, t.turn), t.outcome);
    const [nano, ultra] = a.verdicts;
    return {
      index,
      kind: t.turn.kind,
      nano: nano?.score ?? null,
      ultra: ultra?.score ?? null,
      band: a.consensus.band,
      rated: true,
    };
  });

  const nanoMean = mean(scores.flatMap((s) => (s.nano === null ? [] : [s.nano])));
  const ultraMean = mean(scores.flatMap((s) => (s.ultra === null ? [] : [s.ultra])));
  const nanoBand = nanoMean === null ? null : bandFor(nanoMean);
  const ultraBand = ultraMean === null ? null : bandFor(ultraMean);
  const overallBand =
    nanoBand && ultraBand ? lowerBand(nanoBand, ultraBand) : (nanoBand ?? ultraBand ?? null);

  // Skills: mean level per model across the turns that tested the skill.
  const bySkill = new Map<string, { rubric: SkillRubric; nano: number[]; ultra: number[] }>();
  for (const t of turns) {
    if (!isGraded(t.outcome)) continue;
    for (const s of t.outcome.skills) {
      const entry = bySkill.get(s.skill.name) ?? { rubric: s.skill, nano: [], ultra: [] };
      if (s.nano !== null) entry.nano.push(s.nano);
      if (s.ultra !== null) entry.ultra.push(s.ultra);
      bySkill.set(s.skill.name, entry);
    }
  }
  const skills: ThreadSkill[] = [...bySkill.values()].map((e) => {
    const nano = mean(e.nano);
    const ultra = mean(e.ultra);
    const both = [nano, ultra].filter((v): v is number => v !== null);
    const level = mean(both);
    return {
      name: e.rubric.name,
      nano,
      ultra,
      description: level === null ? null : (e.rubric.levels[Math.min(3, Math.max(0, Math.round(level) - 1))] ?? null),
    };
  });

  // The thread's gap: the most important agreed gap that no turn ended up landing.
  // Key points are written most important first, so the lowest index leads.
  const importance = (line: string) => {
    const i = topic.scaffold.keyPoints.indexOf(line);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const open = turns
    .flatMap((t, turnIndex) => (isGraded(t.outcome) && t.outcome.gap ? [{ gap: t.outcome.gap, turnIndex }] : []))
    .filter((c) => coverage.find((r) => r.line === c.gap.rubricLine)?.status !== "landed")
    .sort((a, b) => importance(a.gap.rubricLine) - importance(b.gap.rubricLine));
  const chosen = open[0] ?? null;

  let agree = 0;
  let total = 0;
  for (const t of turns) {
    if (!isGraded(t.outcome)) continue;
    const c = compareModels(t.outcome);
    if (c.available) {
      agree += c.overall.agree;
      total += c.overall.total;
    }
  }

  return {
    coverage,
    skills,
    turns: scores,
    overall: {
      nano: nanoMean === null ? null : Math.round(nanoMean),
      ultra: ultraMean === null ? null : Math.round(ultraMean),
      band: overallBand,
      agreed: nanoBand !== null && nanoBand === ultraBand,
      single: (nanoBand === null) !== (ultraBand === null),
    },
    gap: chosen?.gap ?? null,
    gapTurn: chosen?.turnIndex ?? null,
    agreement: total > 0 ? { agree, total } : null,
    asked: turns.length,
    rated: scores.filter((s) => s.rated).length,
    supported: [...new Set(turns.flatMap((t) => (isGraded(t.outcome) ? t.outcome.supported : [])))],
  };
}
