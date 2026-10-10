import { describe, expect, it } from "vitest";
import {
  MAX_ROUNDS,
  SESSION_SECONDS,
  canAskFollowUp,
  initialSession,
  remainingSeconds,
  sessionReducer,
  undecided,
  type SessionAction,
  type SessionState,
} from "./session";
import type { RatedOutcome } from "@/types";

const graded: RatedOutcome = {
  status: "graded",
  parts: [
    { part: "P1", status: "addressed", nano: null, ultra: null },
    { part: "P2", status: "disputed", nano: null, ultra: null },
  ],
  points: [],
  skills: [],
  gap: null,
  supported: [],
  models: { extract: "n", nano: "n", ultra: "u" },
  partial: false,
  replay: false,
  calls: [],
};

const ask: SessionAction = {
  type: "ask",
  round: { topicId: "t1", kind: "opening", prompt: "p", reason: "r", targetLine: null },
};

const run = (actions: SessionAction[], from: SessionState = initialSession) =>
  actions.reduce(sessionReducer, from);

describe("sessionReducer", () => {
  it("walks one round from role pick to results", () => {
    const s = run([
      { type: "start", role: "ai-engineer", at: "2026-10-10T09:00:00Z" },
      ask,
      { type: "answer", transcript: "words", spokenSeconds: 70 },
      { type: "graded", outcome: graded },
    ]);
    expect(s.phase).toBe("results");
    expect(s.rounds[0]).toMatchObject({ transcript: "words", spokenSeconds: 70 });
    expect(canAskFollowUp(s)).toBe(true);
  });

  it("will not ask before a role is picked", () => {
    expect(run([ask]).rounds).toHaveLength(0);
  });

  it("caps the session at two rounds", () => {
    const s = run([
      { type: "start", role: "applied-ai", at: "2026-10-10T09:00:00Z" },
      ask,
      ask,
      ask,
    ]);
    expect(s.rounds).toHaveLength(MAX_ROUNDS);
  });

  it("tracks undecided disputed parts until the candidate decides", () => {
    const s = run([
      { type: "start", role: "ai-engineer", at: "2026-10-10T09:00:00Z" },
      ask,
      { type: "answer", transcript: "w", spokenSeconds: 1 },
      { type: "graded", outcome: graded },
    ]);
    expect(undecided(s.rounds[0]!)).toEqual(["P2"]);
    const decided = sessionReducer(s, { type: "decide", line: "P2", decision: "missed" });
    expect(undecided(decided.rounds[0]!)).toEqual([]);
  });

  it("retries a failed round but never a graded one", () => {
    const base = run([
      { type: "start", role: "ai-engineer", at: "2026-10-10T09:00:00Z" },
      ask,
      { type: "answer", transcript: "w", spokenSeconds: 1 },
    ]);
    const failed = sessionReducer(base, {
      type: "graded",
      outcome: { status: "failed", reason: "network-error", detail: "x", calls: [] },
    });
    expect(sessionReducer(failed, { type: "retry" }).phase).toBe("answering");
    const ok = sessionReducer(base, { type: "graded", outcome: graded });
    expect(sessionReducer(ok, { type: "retry" }).phase).toBe("results");
  });

  it("counts down five minutes from the start", () => {
    const s = run([{ type: "start", role: "ai-engineer", at: "2026-10-10T09:00:00Z" }]);
    expect(remainingSeconds(initialSession, new Date())).toBe(SESSION_SECONDS);
    expect(remainingSeconds(s, new Date("2026-10-10T09:02:00Z"))).toBe(180);
    expect(remainingSeconds(s, new Date("2026-10-10T09:09:00Z"))).toBe(0);
  });
});
