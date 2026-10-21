import { useMemo, type ReactNode } from "react";
import { TURN_LABELS } from "@/data/threads";
import { BAND_LABELS, BAND_MEANING, type VerdictBand } from "@/lib/analysis";
import { buildCoachBrief } from "@/lib/coachBrief";
import {
  buildScorecard,
  turnTopic,
  type CellState,
  type LineStatus,
  type ScoredTurn,
} from "@/lib/thread";
import type { Topic } from "@/types";
import { ArrowRightIcon, TargetIcon } from "./icons";
import { Badge, Card, RubricLine, SectionLabel, SpokenQuote, cx } from "./ui";

const HERO_STYLE: Record<VerdictBand, string> = {
  strong: "border-emerald-500/40 bg-gradient-to-br from-emerald-500/15 to-zinc-900/40",
  solid: "border-sky-500/40 bg-gradient-to-br from-sky-500/15 to-zinc-900/40",
  developing: "border-amber-500/40 bg-gradient-to-br from-amber-500/15 to-zinc-900/40",
  "not-yet": "border-rose-500/40 bg-gradient-to-br from-rose-500/15 to-zinc-900/40",
};

const BAR_STYLE: Record<VerdictBand, string> = {
  strong: "bg-emerald-400",
  solid: "bg-sky-400",
  developing: "bg-amber-400",
  "not-yet": "bg-rose-400",
};

const CELL: Record<CellState, { symbol: string; label: string; style: string }> = {
  landed: { symbol: "✓", label: "Both models credit it", style: "border-emerald-500/50 bg-emerald-500/15 text-emerald-300" },
  partial: { symbol: "½", label: "One model credits it", style: "border-nv/50 bg-nv/10 text-nv" },
  touched: { symbol: "~", label: "Mentioned, not credited", style: "border-amber-500/50 bg-amber-500/10 text-amber-300" },
  missed: { symbol: "✕", label: "Asked about it, not said", style: "border-rose-500/50 bg-rose-500/10 text-rose-300" },
  unrated: { symbol: "?", label: "This turn could not be rated", style: "border-zinc-600 border-dashed text-zinc-400" },
  pending: { symbol: "…", label: "Still being rated", style: "border-zinc-700 text-zinc-500" },
};

const STATUS: Record<LineStatus, { label: string; style: string }> = {
  landed: { label: "Landed", style: "text-emerald-300" },
  partial: { label: "Half landed", style: "text-nv" },
  touched: { label: "Touched", style: "text-amber-300" },
  missed: { label: "Missed", style: "text-rose-300" },
  unrated: { label: "Not rated", style: "text-zinc-400" },
  pending: { label: "Rating", style: "text-zinc-500" },
  "not-asked": { label: "Not asked", style: "text-zinc-500" },
};

const level = (v: number | null) => (v === null ? "–" : v.toFixed(1));

/**
 * What a whole interview adds up to. Per-turn results stay in the thread; this
 * is the part a candidate reads once: how it went, which of the topic's ideas
 * landed, where each skill sits, and the one thing to take away.
 */
export default function ThreadScorecard({
  topic,
  turns,
  children,
}: {
  topic: Topic;
  turns: ScoredTurn[];
  /** Extra cards placed after the gap, such as what was saved to memory. */
  children?: ReactNode;
}) {
  const card = useMemo(() => buildScorecard(topic, turns), [topic, turns]);

  const sayNext = useMemo(() => {
    if (card.gapTurn === null) return null;
    const t = turns[card.gapTurn];
    if (!t || t.outcome?.status !== "graded") return null;
    return buildCoachBrief(turnTopic(topic, t.turn), t.outcome).sayNext;
  }, [card.gapTurn, topic, turns]);

  const { overall } = card;
  const agreePct = card.agreement ? Math.round((card.agreement.agree / card.agreement.total) * 100) : null;
  const columns = `minmax(0,1fr) repeat(${Math.max(1, card.asked)}, 1.75rem) 4.75rem`;

  return (
    <div className="space-y-4">
      {/* Verdict */}
      <Card className={cx("animate-fade-up p-6", overall.band ? HERO_STYLE[overall.band] : undefined)}>
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
              Interview verdict · {card.asked} turns
            </p>
            <h2 className="mt-1 text-4xl font-semibold tracking-tight text-zinc-50 sm:text-5xl">
              {overall.band ? BAND_LABELS[overall.band] : "Not rated"}
            </h2>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-zinc-200">
              {overall.band
                ? BAND_MEANING[overall.band]
                : "None of the turns could be rated, so there is nothing to add up."}
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              {card.rated} of {card.asked} turns rated. Each turn was graded only against the ideas it asked about.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 md:w-72 md:shrink-0">
            {(
              [
                ["Nano", overall.nano, "text-violet-300"],
                ["Ultra", overall.ultra, "text-teal-300"],
              ] as const
            ).map(([name, score, accent]) => (
              <div key={name} className="rounded-lg border border-zinc-700/70 bg-zinc-950/50 p-3">
                <p className={cx("text-xs font-semibold", accent)}>{name}</p>
                <p className="mt-0.5 font-mono text-3xl font-semibold text-zinc-50">{score ?? "–"}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  {score !== null && (
                    <div
                      className={cx(
                        "animate-bar-grow h-full rounded-full",
                        BAR_STYLE[score >= 80 ? "strong" : score >= 60 ? "solid" : score >= 40 ? "developing" : "not-yet"],
                      )}
                      style={{ width: `${Math.max(3, score)}%` }}
                    />
                  )}
                </div>
                <p className="mt-1.5 text-xs text-zinc-400">mean over its rated turns</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-zinc-700/50 pt-4 text-sm">
          {overall.agreed && <Badge tone="good">Both models agree</Badge>}
          {!overall.agreed && !overall.single && overall.band && <Badge tone="bad">Models split</Badge>}
          {overall.single && <Badge>One opinion</Badge>}
          {!overall.agreed && !overall.single && overall.band && (
            <span className="text-zinc-400">The stricter band stands.</span>
          )}
          {card.agreement && agreePct !== null && (
            <span className="text-zinc-400">
              They agreed on {card.agreement.agree} of {card.agreement.total} decisions across the interview ({agreePct}%).
            </span>
          )}
        </div>
      </Card>

      {/* Coverage map */}
      <Card className="animate-fade-up">
        <SectionLabel>What you covered</SectionLabel>
        <p className="mb-4 text-sm text-zinc-400">
          The topic has {card.coverage.length} ideas an interviewer listens for. Each column is one turn, and a turn is
          only marked on the ideas it asked about.
        </p>

        <div className="overflow-x-auto">
          <div className="min-w-[34rem]">
            <div className="mb-1 grid items-end gap-2 px-1 text-xs text-zinc-500" style={{ gridTemplateColumns: columns }}>
              <span>Idea</span>
              {turns.map((t, i) => (
                <span key={i} className="text-center" title={`${i + 1}. ${TURN_LABELS[t.turn.kind]}`}>
                  {i + 1}
                </span>
              ))}
              <span className="text-right">Result</span>
            </div>

            <ul className="space-y-1.5">
              {card.coverage.map((row) => (
                <li
                  key={row.index}
                  className="grid items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950/40 px-2 py-2"
                  style={{ gridTemplateColumns: columns }}
                >
                  <span className="text-sm leading-snug text-zinc-200">{row.line}</span>
                  {turns.map((_, i) => {
                    const cell = row.cells.find((c) => c.turn === i);
                    return cell ? (
                      <span
                        key={i}
                        title={CELL[cell.state].label}
                        className={cx(
                          "inline-flex h-7 w-7 items-center justify-center rounded border text-sm font-semibold",
                          CELL[cell.state].style,
                        )}
                      >
                        {CELL[cell.state].symbol}
                      </span>
                    ) : (
                      <span key={i} className="inline-flex h-7 w-7 items-center justify-center text-zinc-700" aria-hidden>
                        ·
                      </span>
                    );
                  })}
                  <span className={cx("text-right text-xs font-medium", STATUS[row.status].style)}>
                    {STATUS[row.status].label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-3 text-xs text-zinc-500">
          ✓ both models credit it · ½ one model · ~ mentioned, not credited · ✕ asked, not said. &ldquo;Not asked&rdquo;
          means the interview never reached that idea, which is different from missing it.
        </p>
      </Card>

      {/* Skills */}
      {card.skills.length > 0 && (
        <Card className="animate-fade-up">
          <SectionLabel>Where each skill sits</SectionLabel>
          <div className="grid gap-3 md:grid-cols-2">
            {card.skills.map((s) => (
              <div key={s.name} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-100">{s.name}</p>
                  <p className="font-mono text-xs text-zinc-400">
                    <span className="text-violet-300">Nano {level(s.nano)}</span>
                    {" · "}
                    <span className="text-teal-300">Ultra {level(s.ultra)}</span>
                    <span className="text-zinc-600"> / 4</span>
                  </p>
                </div>
                {s.description && <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{s.description}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* The one gap */}
      {card.gap ? (
        <Card className="animate-fade-up border-amber-500/40 bg-amber-500/5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-400/15 text-amber-300">
              <TargetIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-amber-300">
                  The one gap to take away · turn {(card.gapTurn ?? 0) + 1}
                </p>
                <p className="mt-1 text-lg leading-relaxed text-zinc-50">{card.gap.plainLanguage}</p>
              </div>
              {card.gap.quote && <SpokenQuote>{card.gap.quote}</SpokenQuote>}
              <RubricLine>{card.gap.rubricLine}</RubricLine>
              {sayNext && sayNext !== card.gap.plainLanguage && (
                <p className="flex items-start gap-2 text-sm text-emerald-200">
                  <ArrowRightIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <span className="font-medium">Say this next time: </span>
                    {sayNext}
                  </span>
                </p>
              )}
            </div>
          </div>
        </Card>
      ) : (
        <Card className="animate-fade-up">
          <p className="text-sm text-zinc-300">
            {card.rated > 0
              ? "The two models did not name the same gap, or nothing was left open, so no gap is recorded. A gap only counts when both agree."
              : "No turn was rated, so there is no gap to report."}
          </p>
        </Card>
      )}

      {children}
    </div>
  );
}
