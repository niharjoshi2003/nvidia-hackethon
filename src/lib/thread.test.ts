import { describe, expect, it } from "vitest";
import { THREADS, spokenPrompt, threadFor } from "@/data/threads";
import { allTopics } from "@/data/topics";
import type { GradedOutcome } from "@/lib/analysis";
import {
  MAX_TURNS,
  buildScorecard,
  coverageFor,
  openingTurn,
  planNextTurn,
  turnTopic,
  type AskedTurn,
  type PlannedTurn,
} from "./thread";
import type { Quality } from "@/types";

const topics = allTopics([]);
const topicById = new Map(topics.map((t) => [t.id, t]));
const RAG = topicById.get("rag-production-design")!;
const RAG_THREAD = threadFor("rag-production-design")!;

interface PointSpec {
  quote: string;
  line: string | null;
  quality: Quality;
}

/** A graded outcome where both models rate every point the same way. */
function outcome(turn: PlannedTurn, points: PointSpec[], gapLine: string | null = null): GradedOutcome {
  const rating = (id: string, p: PointSpec) => ({
    id,
    relevance: "on-question" as const,
    quality: p.quality,
    rubricLine: p.line,
    reason: "",
  });
  const part = { part: turn.part, addressed: true, quote: points[0]?.quote ?? null };
  return {
    status: "graded",
    parts: [{ part: turn.part, status: "addressed", nano: part, ultra: part }],
    points: points.map((p, i) => ({
      point: { id: `p${i + 1}`, quote: p.quote },
      relevance: "on-question",
      quality: p.quality,
      rubricLine: p.line,
      disputed: false,
      nano: rating(`p${i + 1}`, p),
      ultra: rating(`p${i + 1}`, p),
    })),
    skills: [],
    gap: gapLine
      ? {
          from: "ultra",
          rubricLine: gapLine,
          quote: points[0]?.quote ?? "",
          missType: "skipped the check",
          category: "missing-mechanism",
          plainLanguage: "You never said how.",
        }
      : null,
    supported: points.filter((p) => p.quality === "justified" && p.line).map((p) => p.line!),
    models: { extract: "x", nano: "nano", ultra: "ultra" },
    partial: false,
    replay: false,
    calls: [],
  };
}

describe("authored threads", () => {
  it("cover ten design topics across at least five areas, each with a real topic behind it", () => {
    expect(THREADS).toHaveLength(10);
    expect(new Set(THREADS.map((t) => t.topicId)).size).toBe(10);
    expect(new Set(THREADS.map((t) => t.area)).size).toBeGreaterThanOrEqual(5);
    for (const thread of THREADS) expect(topicById.has(thread.topicId)).toBe(true);
  });

  it("ask about every rubric line of the topic at least once", () => {
    for (const thread of THREADS) {
      const topic = topicById.get(thread.topicId)!;
      const asked = new Set(thread.micros.flatMap((m) => m.targets));
      for (let i = 0; i < topic.scaffold.keyPoints.length; i++) {
        expect(asked.has(i), `${thread.topicId}: key point ${i} is never asked`).toBe(true);
      }
    }
  });

  it("keep the opening two turns to an authored scoped question and a decision", () => {
    for (const thread of THREADS) {
      expect(thread.micros[0]?.kind, thread.topicId).toBe("scoped");
      expect(thread.micros[1]?.kind, thread.topicId).toBe("tradeoff");
    }
  });

  it("only target key points that exist, and fit what the server accepts", () => {
    for (const thread of THREADS) {
      const topic = topicById.get(thread.topicId)!;
      const ids = new Set<string>();
      expect(thread.micros.length).toBeGreaterThanOrEqual(MAX_TURNS);
      for (const m of thread.micros) {
        expect(ids.has(m.id), `${thread.topicId}: duplicate id ${m.id}`).toBe(false);
        ids.add(m.id);
        expect(m.targets.length).toBeGreaterThan(0);
        for (const i of m.targets) expect(topic.scaffold.keyPoints[i], `${m.id} target ${i}`).toBeDefined();
        if (m.skill !== null) expect(topic.skills?.[m.skill], `${m.id} skill`).toBeDefined();
        expect(spokenPrompt(m).length).toBeLessThanOrEqual(600);
        expect(m.part.length).toBeLessThanOrEqual(300);
        expect(m.seconds).toBeGreaterThanOrEqual(30);
        expect(m.seconds).toBeLessThanOrEqual(60);
      }
    }
  });

  it("always has a spot-the-flaw question to close on", () => {
    for (const thread of THREADS) expect(thread.micros.some((m) => m.kind === "flaw")).toBe(true);
  });
});

describe("turnTopic", () => {
  it("narrows grading to the lines the turn asked about", () => {
    const turn = openingTurn(RAG_THREAD, RAG);
    const view = turnTopic(RAG, turn);
    expect(view.id).toBe(`${RAG.id}#ingest`);
    expect(view.framing).toBe(turn.prompt);
    expect(view.parts).toEqual([turn.part]);
    expect(view.scaffold.keyPoints).toEqual([RAG.scaffold.keyPoints[2], RAG.scaffold.keyPoints[3]]);
    expect(view.skills).toHaveLength(1);
    // The real topic is untouched.
    expect(RAG.scaffold.keyPoints).toHaveLength(6);
  });
});

describe("planNextTurn", () => {
  const first = openingTurn(RAG_THREAD, RAG);
  const second = planNextTurn(RAG_THREAD, RAG, [{ turn: first, outcome: null }])!;

  it("asks the authored opener, then the authored second question", () => {
    expect(first.id).toBe("ingest");
    expect(second.id).toBe("access");
    expect(second.kind).toBe("tradeoff");
  });

  it("falls back to the authored order when nothing has been rated", () => {
    const next = planNextTurn(RAG_THREAD, RAG, [
      { turn: first, outcome: null },
      { turn: second, outcome: null },
    ])!;
    expect(next.id).toBe("wrong-answers");
  });

  it("asks why about a correct point that came with no reason, quoting the candidate", () => {
    const quote = "I would split the documents along their headings and sections";
    const asked: AskedTurn[] = [
      {
        turn: first,
        outcome: outcome(first, [
          { quote, line: RAG.scaffold.keyPoints[2]!, quality: "correct" },
          { quote: "and run keyword and vector search together", line: RAG.scaffold.keyPoints[3]!, quality: "justified" },
        ]),
      },
      { turn: second, outcome: null },
    ];
    const next = planNextTurn(RAG_THREAD, RAG, asked)!;
    expect(next.kind).toBe("why");
    expect(next.targets).toEqual([RAG.scaffold.keyPoints[2]]);
    expect(next.quoted).toBe(quote);
    expect(next.prompt).toContain(quote);
  });

  it("asks why at most once per thread", () => {
    const quote = "I would split the documents along their headings and sections";
    const why: PlannedTurn = { ...first, id: "why-2", kind: "why", targets: [RAG.scaffold.keyPoints[2]!] };
    const asked: AskedTurn[] = [
      {
        turn: first,
        outcome: outcome(first, [{ quote, line: RAG.scaffold.keyPoints[2]!, quality: "correct" }]),
      },
      { turn: second, outcome: null },
      { turn: why, outcome: null },
    ];
    expect(planNextTurn(RAG_THREAD, RAG, asked)!.kind).not.toBe("why");
  });

  it("goes after the most important idea nobody has landed yet", () => {
    const asked: AskedTurn[] = [
      {
        turn: first,
        outcome: outcome(first, [
          { quote: "split by headings because facts sit under them", line: RAG.scaffold.keyPoints[2]!, quality: "justified" },
          { quote: "both search kinds because names and paraphrases fail differently", line: RAG.scaffold.keyPoints[3]!, quality: "justified" },
        ]),
      },
      {
        turn: second,
        outcome: outcome(second, [
          { quote: "permissions go inside the query so nothing leaks", line: RAG.scaffold.keyPoints[1]!, quality: "justified" },
        ]),
      },
    ];
    const next = planNextTurn(RAG_THREAD, RAG, asked)!;
    // Line 0, the retrieval check, is the most important one still open.
    expect(next.targets).toContain(RAG.scaffold.keyPoints[0]);
    expect(next.reason).toContain(RAG.scaffold.keyPoints[0]!);
  });

  it("never repeats a question and stops after the last turn", () => {
    const turns: AskedTurn[] = [];
    for (let i = 0; i < MAX_TURNS; i++) {
      const next = planNextTurn(RAG_THREAD, RAG, turns);
      expect(next).not.toBeNull();
      expect(turns.some((t) => t.turn.id === next!.id)).toBe(false);
      turns.push({ turn: next!, outcome: null });
    }
    expect(planNextTurn(RAG_THREAD, RAG, turns)).toBeNull();
  });
});

describe("coverage and scorecard", () => {
  const t1 = openingTurn(RAG_THREAD, RAG);
  const t2 = planNextTurn(RAG_THREAD, RAG, [{ turn: t1, outcome: null }])!;
  const t3 = planNextTurn(RAG_THREAD, RAG, [
    { turn: t1, outcome: null },
    { turn: t2, outcome: null },
  ])!; // wrong-answers: lines 0 and 5

  const turns = [
    {
      turn: t1,
      outcome: outcome(t1, [
        { quote: "split by headings because facts sit under them", line: RAG.scaffold.keyPoints[2]!, quality: "justified" },
        { quote: "keyword search misses paraphrases so also use vectors", line: RAG.scaffold.keyPoints[3]!, quality: "vague" },
      ]),
    },
    {
      turn: t2,
      outcome: outcome(t2, [
        { quote: "the filter belongs inside the query", line: RAG.scaffold.keyPoints[1]!, quality: "correct" },
      ]),
    },
    {
      turn: t3,
      outcome: outcome(
        t3,
        [{ quote: "I would rewrite the prompt first and see", line: null, quality: "wrong" }],
        RAG.scaffold.keyPoints[0]!,
      ),
    },
  ];

  it("marks each line by the best turn that asked about it", () => {
    const byLine = Object.fromEntries(coverageFor(RAG, turns).map((r) => [r.index, r.status]));
    expect(byLine[2]).toBe("landed");
    expect(byLine[3]).toBe("touched");
    expect(byLine[1]).toBe("landed");
    expect(byLine[0]).toBe("missed");
    expect(byLine[5]).toBe("missed");
    expect(byLine[4]).toBe("not-asked");
  });

  it("keeps a line nobody asked about separate from one that was missed", () => {
    const rows = coverageFor(RAG, turns);
    expect(rows.find((r) => r.index === 4)!.cells).toEqual([]);
    expect(rows.find((r) => r.index === 0)!.cells).toEqual([{ turn: 2, state: "missed" }]);
  });

  it("reports the agreed gap and the turn it came from", () => {
    const card = buildScorecard(RAG, turns);
    expect(card.gap?.rubricLine).toBe(RAG.scaffold.keyPoints[0]);
    expect(card.gapTurn).toBe(2);
    expect(card.asked).toBe(3);
    expect(card.rated).toBe(3);
  });

  it("drops a gap that a later turn landed", () => {
    const t4 = { ...t3, id: "flaw-accuracy", targets: [RAG.scaffold.keyPoints[0]!] };
    const later = [
      ...turns,
      {
        turn: t4,
        outcome: outcome(t4, [
          { quote: "one number hides whether search or the model failed", line: RAG.scaffold.keyPoints[0]!, quality: "justified" },
        ]),
      },
    ];
    expect(buildScorecard(RAG, later).gap).toBeNull();
  });

  it("collects what the models agreed on, and unrated turns do not count as missed", () => {
    const withFailure = [
      ...turns,
      {
        turn: planNextTurn(RAG_THREAD, RAG, turns)!,
        outcome: { status: "failed" as const, reason: "grade-error" as const, detail: "x", calls: [] },
      },
    ];
    const card = buildScorecard(RAG, withFailure);
    expect(card.asked).toBe(4);
    expect(card.rated).toBe(3);
    expect(card.turns[3]!.rated).toBe(false);
    expect(card.agreement?.total).toBeGreaterThan(0);
  });

  it("gives an overall band only from rated turns", () => {
    expect(buildScorecard(RAG, [{ turn: t1, outcome: null }]).overall.band).toBeNull();
    const card = buildScorecard(RAG, turns);
    expect(card.overall.band).not.toBeNull();
    expect(card.overall.agreed).toBe(true);
  });
});