import { describe, expect, it } from "vitest";
import { agreedCovered, combineVerdicts, gateLineGrade, pickHeadline } from "./parallelSchema";
import type { LineVerdict } from "@/types";

const KEY = ["Alpha point is a full claim here", "Beta point is a full claim here", "Gamma point is a full claim here"];
const [A, B, C] = KEY as [string, string, string];
const TRANSCRIPT = "I would start with alpha because it matters, and then talk about beta briefly.";

const v = (line: string, status: LineVerdict["status"], quote: string | null = null): LineVerdict => ({
  line,
  status,
  quote,
});

describe("gateLineGrade", () => {
  it("keeps a covered verdict whose quote is in the transcript", () => {
    const gated = gateLineGrade(
      { lines: [{ line: A, status: "covered", quote: "start with alpha" }] },
      KEY,
      TRANSCRIPT,
    );
    expect(gated?.verdicts[0]).toEqual(v(A, "covered", "start with alpha"));
  });

  it("demotes a covered verdict whose quote was never said", () => {
    const gated = gateLineGrade(
      { lines: [{ line: A, status: "covered", quote: "I would use a distributed lock" }] },
      KEY,
      TRANSCRIPT,
    );
    expect(gated?.verdicts[0]?.status).toBe("missed");
    expect(gated?.demoted).toEqual([A]);
  });

  it("demotes a covered verdict with no quote", () => {
    const gated = gateLineGrade({ lines: [{ line: A, status: "covered" }] }, KEY, TRANSCRIPT);
    expect(gated?.verdicts[0]?.status).toBe("missed");
  });

  it("drops invented lines and treats omitted lines as missed", () => {
    const gated = gateLineGrade(
      { lines: [{ line: "A line nobody supplied", status: "covered", quote: "alpha" }] },
      KEY,
      TRANSCRIPT,
    );
    expect(gated?.invented).toEqual(["A line nobody supplied"]);
    expect(gated?.verdicts.map((x) => x.status)).toEqual(["missed", "missed", "missed"]);
  });

  it("returns null for an unparseable response", () => {
    expect(gateLineGrade({ nope: true }, KEY, TRANSCRIPT)).toBeNull();
  });

  it("keeps a headline only if it passes the judgment gate", () => {
    const good = {
      rubricLine: C,
      quote: "talk about beta briefly",
      category: "missing-mechanism",
      missType: "skipped gamma",
      plainLanguage: "You never got to gamma.",
    };
    expect(gateLineGrade({ lines: [], headline: good }, KEY, TRANSCRIPT)?.headline?.rubricLine).toBe(C);
    expect(
      gateLineGrade({ lines: [], headline: { ...good, quote: "never said" } }, KEY, TRANSCRIPT)?.headline,
    ).toBeNull();
    expect(
      gateLineGrade({ lines: [], headline: { ...good, rubricLine: "reworded gamma" } }, KEY, TRANSCRIPT)
        ?.headline,
    ).toBeNull();
  });
});

describe("combineVerdicts: every row of the combine table", () => {
  it("covered + covered is covered", () => {
    expect(combineVerdicts([A], [v(A, "covered", "x")], [v(A, "covered", "y")])[0]?.status).toBe("covered");
  });

  it("missed + missed is missed", () => {
    expect(combineVerdicts([A], [v(A, "missed")], [v(A, "missed")])[0]?.status).toBe("missed");
  });

  it("covered + missed is disputed", () => {
    expect(combineVerdicts([A], [v(A, "covered", "x")], [v(A, "missed")])[0]?.status).toBe("disputed");
  });

  it("missed + covered is disputed", () => {
    expect(combineVerdicts([A], [v(A, "missed")], [v(A, "covered", "x")])[0]?.status).toBe("disputed");
  });

  it("a gate-demoted covered counts as missed, so it agrees with missed", () => {
    const nano = gateLineGrade(
      { lines: [{ line: A, status: "covered", quote: "invented words" }] },
      [A],
      TRANSCRIPT,
    );
    expect(combineVerdicts([A], nano!.verdicts, [v(A, "missed")])[0]?.status).toBe("missed");
  });

  it("with one model missing, the other's verdict stands alone", () => {
    const [line] = combineVerdicts([A], null, [v(A, "covered", "x")]);
    expect(line?.status).toBe("covered");
    expect(line?.nano).toBeNull();
  });

  it("keeps key point order", () => {
    expect(combineVerdicts(KEY, [], []).map((l) => l.line)).toEqual(KEY);
  });
});

describe("pickHeadline", () => {
  const lines = combineVerdicts(
    KEY,
    [v(A, "missed"), v(B, "covered", "x"), v(C, "missed")],
    [v(A, "missed"), v(B, "missed"), v(C, "covered", "y")],
  );
  const h = (rubricLine: string) => ({
    rubricLine,
    quote: "q",
    category: "missing-mechanism" as const,
    missType: "m",
    plainLanguage: "p",
  });

  it("prefers Ultra's headline on an agreed miss", () => {
    expect(pickHeadline(lines, { ultra: h(A), nano: h(A) })?.from).toBe("ultra");
  });

  it("drops a headline on a disputed line and falls back to Nano", () => {
    expect(pickHeadline(lines, { ultra: h(B), nano: h(A) })).toMatchObject({ from: "nano", rubricLine: A });
  });

  it("returns null rather than leading with an unagreed line", () => {
    expect(pickHeadline(lines, { ultra: h(C), nano: h(B) })).toBeNull();
  });

  it("agreedCovered excludes disputed lines", () => {
    expect(agreedCovered(lines)).toEqual([]);
  });
});
