/**
 * Turns a gated RatedOutcome into what a candidate should see: grouped quotes,
 * one verdict, and one line to say next. No model names, no per-point disputes.
 */

import type { CombinedPart, CombinedPoint, Gap, GraderId, RatedOutcome, Topic } from "@/types";

export interface CoachBriefPartGroup {
  part: string;
  /** False when the part was not addressed or the models disagreed. */
  landed: boolean;
  /** Quotes the candidate said that count as on-target for this part. */
  highlights: string[];
}

export interface CoachBrief {
  groups: CoachBriefPartGroup[];
  /** True when vague, wrong, off-topic, or disputed fragments were collapsed. */
  hasCollapsedNoise: boolean;
  verdict: string;
  sayNext: string;
  /** Rubric line the follow-up should aim at when there is no agreed gap. */
  targetRubricLine: string | null;
}

const credited = (quality: CombinedPoint["quality"]) => quality === "correct" || quality === "justified";

export function partLanded(part: CombinedPart): boolean {
  return part.status === "addressed";
}

/** Index of the question part a rubric line or quote best belongs to. */
export function rubricLinePartIndex(topic: Topic, line: string | null, quote?: string): number {
  const parts = topic.parts ?? [topic.framing];
  if (parts.length <= 1) return 0;

  const debugPartIdx =
    parts.findIndex((p) => /wrong|debug|trust|cause|look if|find the/.test(p.toLowerCase())) ??
    parts.length - 1;
  const debugIdx = debugPartIdx >= 0 ? debugPartIdx : parts.length - 1;

  const debugLine =
    line != null &&
    /retrieval.*eval|separately from generation|retrieved chunk|which half failed|prompt or the model|read logs|generation fail|signal you can look/i.test(
      line,
    );
  const debugQuote =
    quote != null && /wrong|debug|prompt|log|retriev|embed/i.test(quote) && !/architecture|ingestion|index|chunk|yaml|bm25|rerank/i.test(quote);

  if (debugLine || debugQuote) return debugIdx;

  const lineInGotcha = line != null && topic.scaffold.commonGotchas.includes(line);
  if (lineInGotcha && /prompt|accuracy|chunk size|filtering results after/i.test(line)) return debugIdx;

  return 0;
}

function creditablePoint(p: CombinedPoint): boolean {
  if (p.disputed) return false;
  return credited(p.quality);
}

function assignPartIndex(topic: Topic, p: CombinedPoint): number {
  if (p.rubricLine) return rubricLinePartIndex(topic, p.rubricLine, p.point.quote);
  if (creditablePoint(p)) {
    return rubricLinePartIndex(topic, null, p.point.quote);
  }
  return -1;
}

export function lineForMissedPart(topic: Topic, partIndex: number): string {
  const parts = topic.parts ?? [topic.framing];
  const partText = parts[partIndex]?.toLowerCase() ?? "";

  if (/wrong|debug|trust|cause|look if|find the/.test(partText)) {
    const fromKey = topic.scaffold.keyPoints.find((k) =>
      /retrieval.*eval|separately from generation|signal you can look|bad index|bad prompt/i.test(k),
    );
    if (fromKey) return fromKey;
    const fromModel = topic.modelAnswer.find((m) =>
      /retrieval|generation|wrong|signal|log|measure/i.test(m),
    );
    if (fromModel) return fromModel;
  }

  if (topic.modelAnswer[partIndex]) return topic.modelAnswer[partIndex]!;
  return topic.modelAnswer[0] ?? topic.scaffold.keyPoints[0] ?? "Name one choice and the reason an interviewer would accept it.";
}

export function buildSayNext(
  topic: Topic,
  parts: CombinedPart[],
  gap: (Gap & { from: GraderId }) | null,
): { sayNext: string; targetRubricLine: string | null } {
  if (gap) {
    return {
      sayNext: gap.plainLanguage.trim() || gap.rubricLine,
      targetRubricLine: gap.rubricLine,
    };
  }

  const missedIdx = parts.findIndex((p) => !partLanded(p));
  if (missedIdx >= 0) {
    const line = lineForMissedPart(topic, missedIdx);
    const inRubric =
      topic.scaffold.keyPoints.includes(line) ||
      topic.scaffold.commonGotchas.includes(line) ||
      topic.modelAnswer.includes(line);
    return { sayNext: line, targetRubricLine: inRubric ? line : topic.scaffold.keyPoints[0] ?? null };
  }

  const fallback = topic.scaffold.keyPoints[0] ?? topic.modelAnswer[0] ?? null;
  return {
    sayNext: fallback ?? "Close with one tradeoff you did not mention yet.",
    targetRubricLine: fallback,
  };
}

function buildVerdict(parts: CombinedPart[]): string {
  if (parts.length === 0) return "Your answer was graded.";

  const labels = parts.map((p) => ({ landed: partLanded(p), part: p.part }));
  const all = labels.every((l) => l.landed);
  const none = labels.every((l) => !l.landed);

  if (all) return "You answered every part of the question.";
  if (none) return "You did not land the parts of the question yet.";

  const hit = labels.filter((l) => l.landed).map((l) => l.part);
  const miss = labels.filter((l) => !l.landed).map((l) => l.part);

  if (hit.length === 1 && miss.length === 1) {
    return `You addressed “${hit[0]}”, but not “${miss[0]}”.`;
  }
  return `You partially answered the question; ${miss.length} part${miss.length === 1 ? "" : "s"} still need a direct answer.`;
}

export function buildCoachBrief(topic: Topic, outcome: Extract<RatedOutcome, { status: "graded" }>): CoachBrief {
  const parts = outcome.parts;
  const partCount = parts.length;

  const buckets: string[][] = Array.from({ length: Math.max(partCount, 1) }, () => []);
  let weakCount = 0;

  for (const p of outcome.points) {
    if (!creditablePoint(p)) {
      weakCount++;
      continue;
    }
    const idx = assignPartIndex(topic, p);
    if (idx < 0 || idx >= buckets.length) {
      weakCount++;
      continue;
    }
    const quote = p.point.quote.trim();
    if (quote && !buckets[idx]!.includes(quote)) buckets[idx]!.push(quote);
  }

  const groups: CoachBriefPartGroup[] = parts.map((part, i) => ({
    part: part.part,
    landed: partLanded(part),
    highlights: buckets[i] ?? [],
  }));

  const { sayNext, targetRubricLine } = buildSayNext(topic, parts, outcome.gap);

  return {
    groups,
    hasCollapsedNoise: weakCount > 0,
    verdict: buildVerdict(parts),
    sayNext,
    targetRubricLine,
  };
}
