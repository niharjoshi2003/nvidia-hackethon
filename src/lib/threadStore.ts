/**
 * An interview in progress, kept in this browser so a refresh, a closed tab, or
 * a failed grading call never throws away what the candidate said.
 *
 * Only the interview itself is stored: who is being interviewed, every answered
 * turn with its transcript and whatever the models returned, and the question
 * currently on screen. It is removed when the candidate leaves the interview on
 * purpose. History is the permanent record; this is the safety net under it.
 */

import { threadFor } from "@/data/threads";
import type { PlannedTurn, TurnRecord } from "@/lib/thread";
import type { RoleTrack, SpokenMiss, TraceEntry } from "@/types";

export const THREAD_KEY = "sixty.thread.v1";

export interface SavedThread {
  startedAt: string;
  topicId: string;
  role: RoleTrack;
  reason: string;
  trace: TraceEntry[];
  turns: TurnRecord[];
  /** The question on screen when this was saved. Null between turns. */
  current: PlannedTurn | null;
  /** True once the interview has been written to the miss log. Never written twice. */
  committed: boolean;
  saved: { miss: SpokenMiss | null; closed: SpokenMiss[] } | null;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** The saved interview, or null if there is none or it can no longer be drawn. */
export function loadThread(): SavedThread | null {
  try {
    const raw = localStorage.getItem(THREAD_KEY);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    if (!isObject(v)) return null;
    if (typeof v.startedAt !== "string" || typeof v.topicId !== "string" || typeof v.role !== "string") return null;
    if (!Array.isArray(v.turns)) return null;
    if (!threadFor(v.topicId)) return null;
    const turns = v.turns.filter(
      (t): t is TurnRecord =>
        isObject(t) && isObject(t.turn) && typeof t.transcript === "string" && Array.isArray((t.turn as { targets?: unknown }).targets),
    );
    return {
      startedAt: v.startedAt,
      topicId: v.topicId,
      role: v.role as RoleTrack,
      reason: typeof v.reason === "string" ? v.reason : "",
      trace: Array.isArray(v.trace) ? (v.trace as TraceEntry[]) : [],
      turns,
      current: isObject(v.current) ? (v.current as unknown as PlannedTurn) : null,
      committed: v.committed === true,
      saved: isObject(v.saved) ? (v.saved as unknown as SavedThread["saved"]) : null,
    };
  } catch {
    return null;
  }
}

export function saveThread(thread: SavedThread): void {
  try {
    localStorage.setItem(THREAD_KEY, JSON.stringify(thread));
  } catch {
    // Private mode or a full quota: the interview still works, it just cannot be resumed.
  }
}

export function clearThread(): void {
  try {
    localStorage.removeItem(THREAD_KEY);
  } catch {
    // Nothing to remove.
  }
}
