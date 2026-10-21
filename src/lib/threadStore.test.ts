import { beforeEach, describe, expect, it } from "vitest";
import { THREAD_KEY, clearThread, loadThread, saveThread, type SavedThread } from "./threadStore";
import type { TurnRecord } from "./thread";

const turn: TurnRecord = {
  turn: {
    id: "ingest",
    kind: "scoped",
    prompt: "Start with the documents going in.",
    targets: ["Chunk boundaries follow the document structure"],
    seconds: 60,
    skill: 0,
    part: "Say how documents are split",
    reason: "The opening question",
  },
  transcript: "I would split along headings.",
  spokenSeconds: 31,
  outcome: { status: "failed", reason: "rate-limited", detail: "budget", calls: [] },
  at: "2026-10-20T10:00:00.000Z",
};

const saved: SavedThread = {
  startedAt: "2026-10-20T10:00:00.000Z",
  topicId: "rag-production-design",
  role: "ai-engineer",
  reason: "Opening question",
  trace: [],
  turns: [turn],
  current: null,
  committed: false,
  saved: null,
};

beforeEach(() => localStorage.clear());

describe("saved interview", () => {
  it("comes back exactly as it was left, including a failed turn's transcript", () => {
    saveThread(saved);
    const back = loadThread()!;
    expect(back.turns).toHaveLength(1);
    expect(back.turns[0]!.transcript).toBe("I would split along headings.");
    expect(back.turns[0]!.outcome?.status).toBe("failed");
    expect(back.topicId).toBe("rag-production-design");
    expect(back.committed).toBe(false);
  });

  it("is gone once cleared", () => {
    saveThread(saved);
    clearThread();
    expect(loadThread()).toBeNull();
  });

  it("ignores an interview whose topic no longer has a thread", () => {
    saveThread({ ...saved, topicId: "no-such-topic" });
    expect(loadThread()).toBeNull();
  });

  it("survives junk in storage instead of crashing the screen", () => {
    for (const junk of ["not json", "42", "[]", '{"startedAt":1}', '{"startedAt":"x","topicId":"rag-production-design","role":"r","turns":"no"}']) {
      localStorage.setItem(THREAD_KEY, junk);
      expect(loadThread()).toBeNull();
    }
  });

  it("drops a damaged turn but keeps the rest", () => {
    localStorage.setItem(THREAD_KEY, JSON.stringify({ ...saved, turns: [turn, { nonsense: true }] }));
    expect(loadThread()!.turns).toHaveLength(1);
  });
});
