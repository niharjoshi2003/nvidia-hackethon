/**
 * Session history: every coach session, kept whole, so it can be read back like
 * a conversation. What the interviewer asked, what you said, and everything the
 * two Nemotron models returned about it.
 *
 * Two sources are merged on screen:
 *  - local: saved in this browser as you practise (localStorage),
 *  - featured: sessions shipped in the repo (src/data/showcase.json). They are
 *    the same file format, so "Export" on the history page produces exactly what
 *    the repo expects.
 *
 * Nothing here calls a model or edits a grade. A saved session is a record of
 * what was returned, and the screens re-run the same read-only analysis on it.
 */

import { compareModels, type GradedOutcome } from "@/lib/analysis";
import type { TurnKind } from "@/data/threads";
import type { TopicView } from "@/lib/thread";
import type { RatedOutcome, RoleTrack, TraceEntry } from "@/types";

export const HISTORY_KEY = "sixty.history.v1";
export const HISTORY_VERSION = 1;
/** Oldest sessions are dropped past this, so local storage never fills up. */
export const MAX_SESSIONS = 100;

export type SessionSource = "live" | "replay";

export type RoundKind = "opening" | "followup" | TurnKind;

export interface HistoryRound {
  topicId: string;
  topicTitle: string;
  kind: RoundKind;
  /** What the interviewer asked. */
  prompt: string;
  /** Why the interviewer chose it. */
  reason: string;
  transcript: string;
  spokenSeconds: number;
  outcome: RatedOutcome | null;
  /**
   * Interview threads only: what this turn was graded against (the question, its
   * one part, the lines it asked about). Saved so the result redraws exactly.
   */
  view?: TopicView;
}

export interface ClosedGap {
  missType: string;
  topicId: string;
  topicTitle: string;
}

export interface SavedRepair {
  sentences: Array<{ text: string; rubricLine: string | null }>;
  dropped: number;
}

export interface SavedSession {
  id: string;
  savedAt: string;
  startedAt: string;
  role: RoleTrack | null;
  /** The first question's title. */
  title: string;
  /** Replay means saved responses were served, not live model calls. */
  source: SessionSource;
  /** "thread" for a multi-turn interview. Absent on a classic question and follow-up session. */
  mode?: "thread";
  rounds: HistoryRound[];
  trace: TraceEntry[];
  repair: SavedRepair | null;
  closed: ClosedGap[];
}

/** A session as shown: where it came from is a property of the view, not the record. */
export interface HistoryEntry extends SavedSession {
  featured: boolean;
}

export interface HistoryFile {
  app: "sixty";
  version: number;
  exportedAt: string | null;
  sessions: SavedSession[];
}

const isGraded = (o: RatedOutcome | null): o is GradedOutcome => o?.status === "graded";

// --- building a record --------------------------------------------------------

export interface BuildInput {
  startedAt: string | null;
  role: RoleTrack | null;
  rounds: Array<{
    topicId: string;
    kind: RoundKind;
    prompt: string;
    reason: string;
    transcript: string;
    spokenSeconds: number;
    outcome: RatedOutcome | null;
    view?: TopicView;
  }>;
  mode?: "thread";
  trace: TraceEntry[];
  repair: SavedRepair | null;
  closed: Array<{ missType: string; topicId: string }>;
  titleFor: (topicId: string) => string;
  now?: Date;
}

/**
 * The record for the session so far, or null while nothing has been said.
 *
 * Every answer is kept, rated or not. A grading call can fail or be refused, and
 * the candidate's words must never be thrown away because of that: a round with
 * no rating is saved with its transcript and shows as "not rated".
 */
export function buildSession(input: BuildInput): SavedSession | null {
  if (!input.startedAt) return null;
  const rounds: HistoryRound[] = input.rounds
    .filter((r) => r.transcript.trim().length > 0)
    .map((r) => ({
      topicId: r.topicId,
      topicTitle: input.titleFor(r.topicId),
      kind: r.kind,
      prompt: r.prompt,
      reason: r.reason,
      transcript: r.transcript,
      spokenSeconds: r.spokenSeconds,
      outcome: r.outcome,
      ...(r.view ? { view: r.view } : {}),
    }));
  if (rounds.length === 0) return null;

  const replay = rounds.some((r) => isGraded(r.outcome) && r.outcome.replay);
  return {
    id: `sess_${input.startedAt}`,
    savedAt: (input.now ?? new Date()).toISOString(),
    startedAt: input.startedAt,
    role: input.role,
    title: rounds[0]!.topicTitle,
    source: replay ? "replay" : "live",
    ...(input.mode ? { mode: input.mode } : {}),
    rounds,
    trace: input.trace,
    repair: input.repair,
    closed: input.closed.map((c) => ({ ...c, topicTitle: input.titleFor(c.topicId) })),
  };
}

// --- list operations ------------------------------------------------------------

const newestFirst = (a: SavedSession, b: SavedSession) =>
  new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();

/** Insert or replace by id, newest first, capped. */
export function upsertSession(list: SavedSession[], session: SavedSession): SavedSession[] {
  return [session, ...list.filter((s) => s.id !== session.id)].sort(newestFirst).slice(0, MAX_SESSIONS);
}

export function removeSession(list: SavedSession[], id: string): SavedSession[] {
  return list.filter((s) => s.id !== id);
}

/**
 * Featured and local sessions as one list. A session present in both is shown
 * once, as featured, because the shipped copy is the one judges can also see.
 */
export function mergeEntries(local: SavedSession[], featured: SavedSession[]): HistoryEntry[] {
  const featuredIds = new Set(featured.map((s) => s.id));
  return [
    ...featured.map((s) => ({ ...s, featured: true })),
    ...local.filter((s) => !featuredIds.has(s.id)).map((s) => ({ ...s, featured: false })),
  ].sort(newestFirst);
}

// --- export and import ------------------------------------------------------------

export function serialiseHistory(sessions: SavedSession[], now: Date = new Date()): string {
  const file: HistoryFile = {
    app: "sixty",
    version: HISTORY_VERSION,
    exportedAt: now.toISOString(),
    sessions,
  };
  return JSON.stringify(file, null, 2);
}

export type ParseResult = { ok: true; sessions: SavedSession[] } | { ok: false; error: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Enough structure that the screens cannot crash on it. Not a trust boundary: it is the user's own file. */
function looksLikeSession(v: unknown): v is SavedSession {
  if (!isObject(v)) return false;
  if (typeof v.id !== "string" || typeof v.startedAt !== "string" || typeof v.title !== "string") return false;
  if (!Array.isArray(v.rounds) || v.rounds.length === 0) return false;
  return v.rounds.every((r) => {
    if (!isObject(r) || typeof r.transcript !== "string" || typeof r.prompt !== "string") return false;
    if (typeof r.topicId !== "string") return false;
    const o = r.outcome;
    if (o === null) return true;
    if (!isObject(o) || typeof o.status !== "string") return false;
    return o.status !== "graded" || (Array.isArray(o.parts) && Array.isArray(o.points) && Array.isArray(o.skills));
  });
}

export function parseHistoryFile(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file is not valid JSON." };
  }
  const list = Array.isArray(raw) ? raw : isObject(raw) && Array.isArray(raw.sessions) ? raw.sessions : null;
  if (!list) return { ok: false, error: "No sessions found. Expected a file exported from the history page." };
  const sessions = list.filter(looksLikeSession).map((s) => ({
    ...s,
    trace: Array.isArray(s.trace) ? s.trace : [],
    closed: Array.isArray(s.closed) ? s.closed : [],
    repair: s.repair ?? null,
    source: s.source === "replay" ? ("replay" as const) : ("live" as const),
  }));
  if (sessions.length === 0) return { ok: false, error: "The file had no readable sessions." };
  return { ok: true, sessions };
}

// --- browser storage ----------------------------------------------------------------

export function loadHistory(): SavedSession[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = parseHistoryFile(raw);
    return parsed.ok ? parsed.sessions.sort(newestFirst) : [];
  } catch {
    return [];
  }
}

/** Returns false when the browser refused the write (private mode, full quota). */
export function saveHistory(sessions: SavedSession[]): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    localStorage.setItem(HISTORY_KEY, serialiseHistory(sessions));
    return true;
  } catch {
    return false;
  }
}

/** Save one session into browser history, replacing an earlier save of the same session. */
export function recordSession(session: SavedSession): boolean {
  return saveHistory(upsertSession(loadHistory(), session));
}

// --- what the history adds up to -------------------------------------------------------

export interface HistoryStats {
  sessions: number;
  answersRated: number;
  pointsRated: number;
  /** Decisions both models made, and how many matched. Null when no answer had both. */
  agreement: { agree: number; total: number } | null;
  gapsFound: number;
  gapsClosed: number;
  /** Sessions that came from live model calls rather than replay. */
  liveSessions: number;
}

export function historyStats(entries: SavedSession[]): HistoryStats {
  let answersRated = 0;
  let pointsRated = 0;
  let agree = 0;
  let total = 0;
  let gapsFound = 0;
  let gapsClosed = 0;

  for (const session of entries) {
    gapsClosed += session.closed.length;
    for (const round of session.rounds) {
      if (!isGraded(round.outcome)) continue;
      answersRated += 1;
      pointsRated += round.outcome.points.length;
      if (round.outcome.gap) gapsFound += 1;
      const comparison = compareModels(round.outcome);
      if (comparison.available) {
        agree += comparison.overall.agree;
        total += comparison.overall.total;
      }
    }
  }

  return {
    sessions: entries.length,
    answersRated,
    pointsRated,
    agreement: total > 0 ? { agree, total } : null,
    gapsFound,
    gapsClosed,
    liveSessions: entries.filter((s) => s.source === "live").length,
  };
}
