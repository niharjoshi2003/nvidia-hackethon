/**
 * The five-minute coach session, as a pure reducer.
 *
 * role → question → answer → results → follow-up (twin) → answer → results
 * → repaired answer → done. Kept in sessionStorage so a reload mid-session
 * resumes rather than restarts; closing the tab ends it.
 */

import type {
  LineStatus,
  RatedOutcome,
  RoleTrack,
  TraceEntry,
} from "@/types";

export const SESSION_SECONDS = 5 * 60;
export const MAX_ROUNDS = 2;

export type SessionPhase = "role" | "answering" | "grading" | "results" | "repair" | "done";

export interface Round {
  topicId: string;
  kind: "opening" | "followup";
  /** What the interviewer asked. */
  prompt: string;
  /** Why the interviewer chose it, from the trace. */
  reason: string;
  targetLine: string | null;
  transcript: string;
  spokenSeconds: number;
  outcome: RatedOutcome | null;
  attemptId: string | null;
  /** Candidate decisions on disputed question parts. Covered means addressed. */
  decisions: Record<string, LineStatus>;
}

export interface SessionState {
  phase: SessionPhase;
  role: RoleTrack | null;
  startedAt: string | null;
  rounds: Round[];
  trace: TraceEntry[];
}

export type SessionAction =
  | { type: "start"; role: RoleTrack; at: string }
  | {
      type: "ask";
      round: Pick<Round, "topicId" | "kind" | "prompt" | "reason" | "targetLine">;
    }
  | { type: "answer"; transcript: string; spokenSeconds: number }
  | { type: "graded"; outcome: RatedOutcome }
  | { type: "saved"; attemptId: string }
  | { type: "decide"; line: string; decision: LineStatus }
  | { type: "trace"; entries: TraceEntry[] }
  | { type: "retry" }
  | { type: "repair" }
  | { type: "finish" }
  | { type: "reset" };

export const initialSession: SessionState = {
  phase: "role",
  role: null,
  startedAt: null,
  rounds: [],
  trace: [],
};

function updateCurrent(state: SessionState, patch: Partial<Round>): SessionState {
  const last = state.rounds.at(-1);
  if (!last) return state;
  return { ...state, rounds: [...state.rounds.slice(0, -1), { ...last, ...patch }] };
}

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "start":
      return { ...initialSession, phase: "role", role: action.role, startedAt: action.at };
    case "ask":
      if (!state.role || state.rounds.length >= MAX_ROUNDS) return state;
      return {
        ...state,
        phase: "answering",
        rounds: [
          ...state.rounds,
          {
            ...action.round,
            transcript: "",
            spokenSeconds: 0,
            outcome: null,
            attemptId: null,
            decisions: {},
          },
        ],
      };
    case "answer":
      if (state.phase !== "answering") return state;
      return {
        ...updateCurrent(state, {
          transcript: action.transcript,
          spokenSeconds: action.spokenSeconds,
        }),
        phase: "grading",
      };
    case "graded":
      if (state.phase !== "grading") return state;
      return { ...updateCurrent(state, { outcome: action.outcome }), phase: "results" };
    case "saved":
      return updateCurrent(state, { attemptId: action.attemptId });
    case "decide": {
      const last = state.rounds.at(-1);
      if (!last) return state;
      return updateCurrent(state, {
        decisions: { ...last.decisions, [action.line]: action.decision },
      });
    }
    case "trace":
      return { ...state, trace: [...state.trace, ...action.entries] };
    case "retry": {
      // Only an ungraded round can be retried; a graded one is already stored.
      const last = state.rounds.at(-1);
      if (state.phase !== "results" || !last || last.outcome?.status === "graded") return state;
      return { ...updateCurrent(state, { outcome: null }), phase: "answering" };
    }
    case "repair":
      return state.rounds.length > 0 ? { ...state, phase: "repair" } : state;
    case "finish":
      return { ...state, phase: "done" };
    case "reset":
      return initialSession;
  }
}

export function currentRound(state: SessionState): Round | undefined {
  return state.rounds.at(-1);
}

export function canAskFollowUp(state: SessionState): boolean {
  return state.phase === "results" && state.rounds.length < MAX_ROUNDS;
}

export function remainingSeconds(state: SessionState, now: Date): number {
  if (!state.startedAt) return SESSION_SECONDS;
  const spent = Math.floor((now.getTime() - new Date(state.startedAt).getTime()) / 1000);
  return Math.max(0, SESSION_SECONDS - spent);
}

/** Disputed question parts in a round that the candidate has not decided yet. */
export function undecided(round: Round): string[] {
  if (round.outcome?.status !== "graded") return [];
  return round.outcome.parts
    .filter((p) => p.status === "disputed" && !(p.part in round.decisions))
    .map((p) => p.part);
}

// --- persistence ------------------------------------------------------------

const KEY = "sixty.session";

export function loadSession(): SessionState {
  if (typeof sessionStorage === "undefined") return initialSession;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return initialSession;
    const parsed = JSON.parse(raw) as SessionState;
    if (!parsed || !Array.isArray(parsed.rounds)) return initialSession;
    // A session saved before rated answers holds checklist outcomes this screen cannot draw.
    if (parsed.rounds.some((r) => r.outcome?.status === "graded" && !Array.isArray(r.outcome.parts))) {
      return initialSession;
    }
    // A reload during grading loses the in-flight request; go back to answering.
    return parsed.phase === "grading" ? { ...parsed, phase: "answering" } : parsed;
  } catch {
    return initialSession;
  }
}

export function saveSession(state: SessionState): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (state.phase === "role" && !state.role) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private mode or quota. The session continues in memory.
  }
}
