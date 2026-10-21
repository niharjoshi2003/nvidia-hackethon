import { describe, expect, it } from "vitest";
import {
  MAX_SESSIONS,
  buildSession,
  historyStats,
  mergeEntries,
  parseHistoryFile,
  removeSession,
  serialiseHistory,
  upsertSession,
  type BuildInput,
  type SavedSession,
} from "./history";
import { ragProductionOutcome } from "@/evidence/ragProductionSample";

const graded = ragProductionOutcome();

const input = (over: Partial<BuildInput> = {}): BuildInput => ({
  startedAt: "2026-10-20T10:00:00.000Z",
  role: "ai-engineer",
  rounds: [
    {
      topicId: "rag-production-design",
      kind: "opening",
      prompt: "Design a production RAG system",
      reason: "Opening question",
      transcript: "I would chunk by headings.",
      spokenSeconds: 42,
      outcome: graded,
    },
  ],
  trace: [],
  repair: null,
  closed: [],
  titleFor: (id) => `Title of ${id}`,
  now: new Date("2026-10-20T10:05:00.000Z"),
  ...over,
});

const session = (id: string, startedAt: string): SavedSession => ({
  ...buildSession(input({ startedAt }))!,
  id,
});

describe("buildSession", () => {
  it("keeps the transcript, the outcome and a readable title", () => {
    const s = buildSession(input())!;
    expect(s.id).toBe("sess_2026-10-20T10:00:00.000Z");
    expect(s.title).toBe("Title of rag-production-design");
    expect(s.rounds[0]!.transcript).toBe("I would chunk by headings.");
    expect(s.rounds[0]!.outcome).toBe(graded);
    expect(s.source).toBe("live");
  });

  it("keeps what was said even when the models never rated it", () => {
    const refused = input().rounds.map((r) => ({
      ...r,
      outcome: { status: "failed" as const, reason: "rate-limited" as const, detail: "budget", calls: [] },
    }));
    const s = buildSession(input({ rounds: refused as BuildInput["rounds"] }))!;
    expect(s.rounds).toHaveLength(1);
    expect(s.rounds[0]!.transcript).toBe("I would chunk by headings.");
    expect(s.rounds[0]!.outcome?.status).toBe("failed");

    const pending = input().rounds.map((r) => ({ ...r, outcome: null }));
    expect(buildSession(input({ rounds: pending }))!.rounds[0]!.outcome).toBeNull();
  });

  it("returns nothing before anything has been said", () => {
    expect(buildSession(input({ rounds: [] }))).toBeNull();
    const silent = input().rounds.map((r) => ({ ...r, transcript: "  " }));
    expect(buildSession(input({ rounds: silent }))).toBeNull();
    expect(buildSession(input({ startedAt: null }))).toBeNull();
  });

  it("does not count unrated answers in the totals", () => {
    const refused = input().rounds.map((r) => ({
      ...r,
      outcome: { status: "failed" as const, reason: "rate-limited" as const, detail: "budget", calls: [] },
    }));
    const stats = historyStats([buildSession(input({ rounds: refused as BuildInput["rounds"] }))!]);
    expect(stats.answersRated).toBe(0);
    expect(stats.gapsFound).toBe(0);
  });

  it("marks a session replay when saved responses were served", () => {
    const rounds = input().rounds.map((r) => ({ ...r, outcome: { ...graded, replay: true } }));
    expect(buildSession(input({ rounds }))!.source).toBe("replay");
  });

  it("names the questions behind closed gaps", () => {
    const s = buildSession(input({ closed: [{ missType: "no eval", topicId: "rag-contract-debug" }] }))!;
    expect(s.closed).toEqual([{ missType: "no eval", topicId: "rag-contract-debug", topicTitle: "Title of rag-contract-debug" }]);
  });
});

describe("list operations", () => {
  it("replaces a session saved twice instead of duplicating it", () => {
    const a = session("a", "2026-10-20T10:00:00.000Z");
    const updated = { ...a, title: "changed" };
    const list = upsertSession(upsertSession([], a), updated);
    expect(list).toHaveLength(1);
    expect(list[0]!.title).toBe("changed");
  });

  it("keeps newest first and caps the list", () => {
    let list: SavedSession[] = [];
    for (let i = 0; i < MAX_SESSIONS + 5; i += 1) {
      const startedAt = new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString();
      list = upsertSession(list, session(`s${i}`, startedAt));
    }
    expect(list).toHaveLength(MAX_SESSIONS);
    expect(list[0]!.id).toBe(`s${MAX_SESSIONS + 4}`);
  });

  it("removes by id", () => {
    const a = session("a", "2026-10-20T10:00:00.000Z");
    expect(removeSession([a], "a")).toEqual([]);
  });

  it("shows a session present in both lists once, as featured", () => {
    const a = session("a", "2026-10-20T10:00:00.000Z");
    const b = session("b", "2026-10-21T10:00:00.000Z");
    const merged = mergeEntries([a, b], [a]);
    expect(merged.map((m) => [m.id, m.featured])).toEqual([
      ["b", false],
      ["a", true],
    ]);
  });
});

describe("export and import", () => {
  it("round-trips through the file format", () => {
    const a = session("a", "2026-10-20T10:00:00.000Z");
    const parsed = parseHistoryFile(serialiseHistory([a]));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.sessions).toHaveLength(1);
      expect(parsed.sessions[0]!.rounds[0]!.transcript).toBe("I would chunk by headings.");
    }
  });

  it("rejects text that is not JSON, and files with no sessions", () => {
    expect(parseHistoryFile("not json")).toEqual({ ok: false, error: "That file is not valid JSON." });
    expect(parseHistoryFile('{"hello":1}').ok).toBe(false);
    expect(parseHistoryFile('{"sessions":[]}').ok).toBe(false);
  });

  it("drops entries a screen could not draw", () => {
    const a = session("a", "2026-10-20T10:00:00.000Z");
    const broken = { id: "x", startedAt: "2026-10-20T10:00:00.000Z", title: "t", rounds: [{ topicId: "t", prompt: "p", transcript: "w", outcome: { status: "graded" } }] };
    const parsed = parseHistoryFile(JSON.stringify({ sessions: [a, broken] }));
    expect(parsed.ok && parsed.sessions.map((s) => s.id)).toEqual(["a"]);
  });
});

describe("historyStats", () => {
  it("adds up answers, points, gaps and agreement from real outcomes", () => {
    const a = session("a", "2026-10-20T10:00:00.000Z");
    const b = { ...session("b", "2026-10-21T10:00:00.000Z"), closed: [{ missType: "m", topicId: "t", topicTitle: "T" }] };
    const stats = historyStats([a, b]);
    expect(stats.sessions).toBe(2);
    expect(stats.answersRated).toBe(2);
    expect(stats.pointsRated).toBe(graded.points.length * 2);
    expect(stats.gapsClosed).toBe(1);
    expect(stats.liveSessions).toBe(2);
    expect(stats.agreement?.total).toBeGreaterThan(0);
  });

  it("reports no agreement when there is nothing to compare", () => {
    expect(historyStats([]).agreement).toBeNull();
  });
});
