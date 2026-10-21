import { useMemo, useState } from "react";
import { COACH_SUMMARY, accuracyLine } from "@/data/accuracy";
import { analyse, BAND_LABELS, GRADER_LABELS, type GradedOutcome, type VerdictBand } from "@/lib/analysis";
import { buildCoachBrief } from "@/lib/coachBrief";
import { plainVerdict } from "@/lib/summary";
import type { SpokenMiss, Topic, TraceEntry } from "@/types";
import Analysis from "./Analysis";
import AnnotatedTranscript from "./AnnotatedTranscript";
import { ArrowRightIcon, CheckIcon, QuoteIcon, TargetIcon } from "./icons";
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

const GRADER_ACCENT = { nano: "text-violet-300", ultra: "text-teal-300" } as const;

interface GradedResultProps {
  topic: Topic;
  outcome: GradedOutcome;
  trace: TraceEntry[];
  /** The candidate's words. Empty for archived results that never kept them. */
  transcript: string;
  closed: SpokenMiss[];
  topicTitle: (id: string) => string;
  proofDefaultOpen?: boolean;
  /** For screens that already show the highlighted transcript themselves. */
  hideTranscript?: boolean;
}

/**
 * The results screen, in the order a candidate asks the questions:
 * how did I do, what do I say next, what did I say well and badly, and why
 * should I believe it. The model-by-model detail sits behind one toggle.
 */
export default function GradedResult({
  topic,
  outcome,
  trace,
  transcript,
  closed,
  topicTitle,
  proofDefaultOpen = false,
  hideTranscript = false,
}: GradedResultProps) {
  const [proofOpen, setProofOpen] = useState(proofDefaultOpen);
  const reading = useMemo(() => analyse(topic, outcome), [topic, outcome]);
  const brief = useMemo(() => buildCoachBrief(topic, outcome), [topic, outcome]);
  const verdict = useMemo(() => plainVerdict(outcome), [outcome]);
  const { consensus, comparison } = reading;

  const strongest = [...reading.verdicts]
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
    .find((v) => v.strongest)?.strongest;

  const agreePct =
    comparison.available && comparison.overall.total > 0
      ? Math.round((comparison.overall.agree / comparison.overall.total) * 100)
      : null;

  return (
    <div className="space-y-4">
      {(outcome.replay || outcome.partial) && (
        <div className="flex flex-wrap gap-2">
          {outcome.replay && <Badge>Replay, not live</Badge>}
          {outcome.partial && (
            <Badge tone="bad">
              Only {outcome.models.nano ? "Nano" : "Ultra"} answered; one opinion per rating
            </Badge>
          )}
        </div>
      )}

      {/* 1. How did I do */}
      <Card className={cx("animate-fade-up p-6", consensus.band ? HERO_STYLE[consensus.band] : undefined)}>
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">Verdict</p>
            <h2 className="mt-1 text-4xl font-semibold tracking-tight text-zinc-50 sm:text-5xl">
              {consensus.band ? BAND_LABELS[consensus.band] : consensus.headline}
            </h2>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-zinc-200">{verdict.sentence}</p>
            {verdict.note && <p className="mt-1 text-sm text-zinc-400">{verdict.note}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3 md:w-72 md:shrink-0">
            {reading.verdicts.map((v) => (
              <div key={v.grader} className="rounded-lg border border-zinc-700/70 bg-zinc-950/50 p-3">
                <p className={cx("text-xs font-semibold", GRADER_ACCENT[v.grader])}>{GRADER_LABELS[v.grader]}</p>
                <p className="mt-0.5 font-mono text-3xl font-semibold text-zinc-50">{v.score ?? "–"}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  {v.score !== null && v.band && (
                    <div
                      className={cx("animate-bar-grow h-full rounded-full", BAR_STYLE[v.band])}
                      style={{ width: `${Math.max(3, v.score)}%` }}
                    />
                  )}
                </div>
                <p className="mt-1.5 text-xs text-zinc-400">{v.band ? BAND_LABELS[v.band] : "no rating"}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-zinc-700/50 pt-4 text-sm">
          {consensus.agreed && <Badge tone="good">Both models agree</Badge>}
          {!consensus.agreed && !consensus.single && consensus.band && (
            <Badge tone="bad">Models split</Badge>
          )}
          {consensus.single && <Badge>One opinion</Badge>}
          {!consensus.agreed && !consensus.single && (
            <span className="text-zinc-400">The stricter reading stands, so you are not credited for what only one model saw.</span>
          )}
          {agreePct !== null && (
            <span className="text-zinc-400">
              They agreed on {comparison.overall.agree} of {comparison.overall.total} decisions ({agreePct}%).
            </span>
          )}
        </div>
      </Card>

      {/* 2. What do I say next */}
      <Card className="animate-fade-up border-emerald-500/40 bg-emerald-500/10">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-400/15 text-emerald-300">
            <ArrowRightIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-emerald-300">Say this next time</p>
            <p className="mt-1 text-lg leading-relaxed text-emerald-50">{brief.sayNext}</p>
          </div>
        </div>
      </Card>

      {/* 3. Best moment and biggest gap */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="mb-2 flex items-center gap-2 text-emerald-300">
            <QuoteIcon className="h-4 w-4" />
            <SectionLabel>Your best moment</SectionLabel>
          </div>
          {strongest ? (
            <>
              <SpokenQuote>{strongest.point.quote}</SpokenQuote>
              {strongest.rating.reason && <p className="mt-2 text-sm text-zinc-400">{strongest.rating.reason}</p>}
            </>
          ) : (
            <p className="text-sm text-zinc-400">No point earned consistent credit from the ratings.</p>
          )}
        </Card>
        <Card>
          <div className="mb-2 flex items-center gap-2 text-amber-300">
            <TargetIcon className="h-4 w-4" />
            <SectionLabel>The one gap</SectionLabel>
          </div>
          {outcome.gap ? (
            <>
              <RubricLine>{outcome.gap.rubricLine}</RubricLine>
              <p className="mt-2 text-sm text-zinc-400">{outcome.gap.plainLanguage}</p>
              <p className="mt-2 text-xs text-zinc-500">Stays open until you cover it on a different question.</p>
            </>
          ) : (
            <p className="text-sm text-zinc-400">
              The models did not name the same gap, so none is recorded. Their separate views are in the proof below.
            </p>
          )}
        </Card>
      </div>

      {/* 4. Your own words, rated */}
      {!hideTranscript && transcript.trim() && <AnnotatedTranscript transcript={transcript} points={outcome.points} />}

      {/* 5. Question parts */}
      <Card>
        <SectionLabel>Did you answer what was asked?</SectionLabel>
        <ul className="mt-3 space-y-4">
          {brief.groups.map((group) => (
            <li key={group.part}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={group.highlights.length > 0 ? "good" : group.landed ? "accent" : "bad"}>
                  {group.highlights.length > 0
                    ? "On target"
                    : group.landed
                      ? "Addressed, weak evidence"
                      : "Not addressed"}
                </Badge>
                <span className="text-sm text-zinc-200">{group.part}</span>
              </div>
              {group.highlights.length > 0 ? (
                <ul className="mt-2 space-y-2">
                  {group.highlights.map((quote) => (
                    <li key={quote}>
                      <SpokenQuote>{quote}</SpokenQuote>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-zinc-400">
                  {group.landed
                    ? "The models found words for this part, but no point earned consistent quality credit."
                    : "No direct answer to this part passed both models' checks."}
                </p>
              )}
            </li>
          ))}
        </ul>
        {brief.hasCollapsedNoise && (
          <p className="mt-4 text-xs text-zinc-500">
            Vague, wrong, off-topic, and disputed fragments are in the proof below.
          </p>
        )}
      </Card>

      {closed.length > 0 && (
        <Card className="animate-fade-up border-emerald-500/40 bg-emerald-500/10">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-400/15 text-emerald-300">
              <CheckIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-emerald-300">Gap closed</p>
              {closed.map((m) => (
                <p key={m.id} className="mt-1 text-sm text-emerald-50">
                  &ldquo;{m.missType}&rdquo; from <span className="text-emerald-200/80">{topicTitle(m.topicId)}</span> is
                  now closed: you covered it here, with the reason, on a question you had not been asked before.
                </p>
              ))}
            </div>
          </div>
        </Card>
      )}

      {COACH_SUMMARY.measured && (
        <Card>
          <SectionLabel>How accurate is this grader?</SectionLabel>
          <ul className="mt-2 space-y-1 text-sm text-zinc-300">
            {(["nano", "ultra", "combined"] as const).map((g) => (
              <li key={g}>
                <span className="font-medium text-zinc-100">{g === "combined" ? "Both together" : GRADER_LABELS[g]}:</span>{" "}
                {accuracyLine(g)}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-zinc-500">
            Measured against human labels on a frozen set of {COACH_SUMMARY.answers} spoken answers, not against each other.
          </p>
        </Card>
      )}

      {/* 6. Why believe it */}
      <div>
        <button
          type="button"
          onClick={() => setProofOpen((o) => !o)}
          aria-expanded={proofOpen}
          className="flex w-full items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-5 py-3 text-left text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-700"
        >
          <span>
            {proofOpen ? "Hide" : "Show"} the proof behind the verdict
            <span className="ml-2 text-xs font-normal text-zinc-500">
              Nano vs Ultra, point by point, how it ran
            </span>
          </span>
          <span className={cx("text-zinc-500 transition-transform", proofOpen && "rotate-180")} aria-hidden>
            ▾
          </span>
        </button>
        {proofOpen && (
          <div className="mt-3">
            <Analysis topic={topic} outcome={outcome} trace={trace} />
          </div>
        )}
      </div>
    </div>
  );
}
