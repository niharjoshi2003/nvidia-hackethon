import { useMemo, useState } from "react";
import {
  QUALITY_LABELS,
  RELEVANCE_LABELS,
  type GraderId,
  type OutboundCall,
  type PointRating,
  type Quality,
  type Relevance,
  type Topic,
  type TraceEntry,
} from "@/types";
import {
  analyse,
  BAND_LABELS,
  bandFor,
  GRADER_LABELS,
  GRADERS,
  PARAMETERS,
  type GradedOutcome,
  type KeyPointStatus,
  type ModelVerdict,
  type VerdictBand,
} from "@/lib/analysis";
import { Badge, SectionLabel, SpokenQuote, cx } from "./ui";

type Tab = "verdict" | "compare" | "points" | "keyPoints" | "skills" | "pipeline";

const TABS: { id: Tab; label: string }[] = [
  { id: "verdict", label: "Verdict" },
  { id: "compare", label: "Nano vs Ultra" },
  { id: "points", label: "Point by point" },
  { id: "keyPoints", label: "Key ideas" },
  { id: "skills", label: "Skills" },
  { id: "pipeline", label: "How it ran" },
];

const BAND_STYLE: Record<VerdictBand, string> = {
  strong: "border-emerald-500/50 bg-emerald-500/10 text-emerald-200",
  solid: "border-sky-500/50 bg-sky-500/10 text-sky-200",
  developing: "border-amber-500/50 bg-amber-500/10 text-amber-200",
  "not-yet": "border-rose-500/50 bg-rose-500/10 text-rose-200",
};

const BAR_STYLE: Record<VerdictBand, string> = {
  strong: "bg-emerald-400",
  solid: "bg-sky-400",
  developing: "bg-amber-400",
  "not-yet": "bg-rose-400",
};

const QUALITY_STYLE: Record<Quality, string> = {
  wrong: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  vague: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  correct: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  justified: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
};

const RELEVANCE_STYLE: Record<Relevance, string> = {
  "on-question": "text-zinc-300",
  related: "text-amber-300",
  "off-topic": "text-rose-300",
};

const GRADER_ACCENT: Record<GraderId, string> = {
  nano: "text-violet-300",
  ultra: "text-teal-300",
};

const GRADER_BAR: Record<GraderId, string> = {
  nano: "bg-violet-400",
  ultra: "bg-teal-400",
};

const scoreBand = (score: number | null): VerdictBand | null => (score === null ? null : bandFor(score));

export default function Analysis({
  topic,
  outcome,
  trace,
}: {
  topic: Topic;
  outcome: GradedOutcome;
  trace: TraceEntry[];
}) {
  const [tab, setTab] = useState<Tab>("verdict");
  const analysis = useMemo(() => analyse(topic, outcome), [topic, outcome]);

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/50">
      <div className="border-b border-zinc-800 px-5 pt-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-zinc-100">Full analysis</h2>
          <p className="text-[11px] text-zinc-500">
            Two Nemotron models, same prompt, rated independently. Every claim below is checked against your words.
          </p>
        </div>
        <div role="tablist" className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cx(
                "whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors",
                tab === t.id
                  ? "border-amber-400 text-zinc-100"
                  : "border-transparent text-zinc-500 hover:text-zinc-300",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5">
        {tab === "verdict" && <VerdictTab analysis={analysis} />}
        {tab === "compare" && <CompareTab analysis={analysis} />}
        {tab === "points" && <PointsTab outcome={outcome} />}
        {tab === "keyPoints" && <KeyPointsTab analysis={analysis} outcome={outcome} />}
        {tab === "skills" && <SkillsTab outcome={outcome} />}
        {tab === "pipeline" && <PipelineTab outcome={outcome} trace={trace} />}
      </div>
    </section>
  );
}

// --- verdict ------------------------------------------------------------------

function VerdictTab({ analysis }: { analysis: ReturnType<typeof analyse> }) {
  const { consensus, verdicts } = analysis;
  return (
    <div className="space-y-5">
      <div className={cx("rounded-lg border p-4", consensus.band ? BAND_STYLE[consensus.band] : "border-zinc-700")}>
        <p className="text-[11px] font-medium uppercase tracking-wider opacity-70">Final verdict</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="text-2xl font-semibold tracking-tight">{consensus.headline}</p>
          {consensus.agreed && <Badge tone="good">Both models agree</Badge>}
          {!consensus.agreed && !consensus.single && consensus.band && <Badge tone="bad">Models split</Badge>}
          {consensus.single && <Badge>One opinion</Badge>}
        </div>
        <p className="mt-2 text-sm leading-relaxed opacity-90">{consensus.explanation}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {verdicts.map((v) => (
          <ModelCard key={v.grader} verdict={v} />
        ))}
      </div>

      <div>
        <SectionLabel>How the score is built</SectionLabel>
        <ul className="space-y-1.5 text-xs text-zinc-400">
          {PARAMETERS.map((p) => (
            <li key={p.id} className="flex gap-2">
              <span className="w-10 shrink-0 font-mono text-zinc-500">{Math.round(p.weight * 100)}%</span>
              <span>
                <span className="text-zinc-200">{p.label}.</span> {p.method}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-zinc-500">
          Bands: 80+ strong, 60–79 solid, 40–59 developing, below 40 not yet. A parameter that does not apply
          to this question is left out and the weights rescale.
        </p>
      </div>
    </div>
  );
}

function ModelCard({ verdict }: { verdict: ModelVerdict }) {
  const name = GRADER_LABELS[verdict.grader];
  if (!verdict.answered || verdict.score === null || !verdict.band) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
        <p className={cx("text-sm font-semibold", GRADER_ACCENT[verdict.grader])}>{name}</p>
        <p className="mt-2 text-sm text-zinc-500">{verdict.summary}</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={cx("text-sm font-semibold", GRADER_ACCENT[verdict.grader])}>{name}</p>
          <p className="font-mono text-[10px] text-zinc-600">{verdict.model}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl font-semibold text-zinc-100">{verdict.score}</p>
          <p className="text-[11px] text-zinc-400">{BAND_LABELS[verdict.band]}</p>
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {verdict.parameters.map((p) => (
          <li key={p.id}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-zinc-300">{p.label}</span>
              <span className="font-mono text-zinc-400">{p.score ?? "n/a"}</span>
            </div>
            <Bar value={p.score} band={scoreBand(p.score)} />
            <p className="mt-0.5 text-[11px] text-zinc-500">{p.detail}</p>
          </li>
        ))}
      </ul>

      <QualityMix mix={verdict.qualityMix} />

      <p className="mt-3 text-xs leading-relaxed text-zinc-400">{verdict.summary}</p>

      {verdict.strongest && (
        <div className="mt-3">
          <p className="text-[11px] font-medium text-emerald-300">Best point, in {name}&rsquo;s view</p>
          <div className="mt-1">
            <SpokenQuote>{verdict.strongest.point.quote}</SpokenQuote>
          </div>
          {verdict.strongest.rating.reason && (
            <p className="mt-1 pl-3 text-[11px] text-zinc-500">{verdict.strongest.rating.reason}</p>
          )}
        </div>
      )}
      {verdict.weakest && (
        <div className="mt-3">
          <p className="text-[11px] font-medium text-rose-300">Weakest point</p>
          <div className="mt-1">
            <SpokenQuote>{verdict.weakest.point.quote}</SpokenQuote>
          </div>
          {verdict.weakest.rating.reason && (
            <p className="mt-1 pl-3 text-[11px] text-zinc-500">{verdict.weakest.rating.reason}</p>
          )}
        </div>
      )}
      <div className="mt-3 border-t border-zinc-800 pt-3">
        <p className="text-[11px] font-medium text-zinc-400">What {name} says is most missing</p>
        {verdict.gap ? (
          <>
            <p className="mt-1 text-xs text-zinc-200">{verdict.gap.rubricLine}</p>
            <p className="mt-1 text-[11px] text-zinc-500">{verdict.gap.plainLanguage}</p>
          </>
        ) : (
          <p className="mt-1 text-[11px] text-zinc-500">Nothing, or its pick did not pass the checks.</p>
        )}
      </div>
    </div>
  );
}

function Bar({ value, band, tone }: { value: number | null; band?: VerdictBand | null; tone?: string }) {
  return (
    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
      {value !== null && (
        <div
          className={cx("h-full rounded-full", tone ?? (band ? BAR_STYLE[band] : "bg-zinc-500"))}
          style={{ width: `${Math.max(2, value)}%` }}
        />
      )}
    </div>
  );
}

function QualityMix({ mix }: { mix: Record<Quality, number> }) {
  const total = Object.values(mix).reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const order: Quality[] = ["justified", "correct", "vague", "wrong"];
  const fill: Record<Quality, string> = {
    justified: "bg-emerald-400",
    correct: "bg-sky-400",
    vague: "bg-amber-400",
    wrong: "bg-rose-400",
  };
  return (
    <div className="mt-3">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-zinc-800">
        {order.map((q) =>
          mix[q] > 0 ? <div key={q} className={fill[q]} style={{ width: `${(mix[q] / total) * 100}%` }} /> : null,
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-[10px] text-zinc-500">
        {order.map((q) => (
          <span key={q}>
            {QUALITY_LABELS[q]} {mix[q]}
          </span>
        ))}
      </div>
    </div>
  );
}

// --- comparison ---------------------------------------------------------------

function CompareTab({ analysis }: { analysis: ReturnType<typeof analyse> }) {
  const { comparison, verdicts } = analysis;
  if (!comparison.available) {
    return (
      <p className="text-sm text-zinc-400">
        Only one model answered this time, so there is nothing to compare. Its verdict stands on its own in the
        Verdict tab.
      </p>
    );
  }
  const overallPct = Math.round((comparison.overall.agree / Math.max(1, comparison.overall.total)) * 100);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Overall agreement" value={`${overallPct}%`} sub={`${comparison.overall.agree} of ${comparison.overall.total} decisions`} />
        {verdicts.map((v) => (
          <Stat
            key={v.grader}
            label={`${GRADER_LABELS[v.grader]} score`}
            value={v.score === null ? "n/a" : String(v.score)}
            sub={v.band ? BAND_LABELS[v.band] : "did not answer"}
            accent={GRADER_ACCENT[v.grader]}
          />
        ))}
      </div>

      <div>
        <SectionLabel>Where they agree, decision by decision</SectionLabel>
        <ul className="space-y-3">
          {comparison.rows
            .filter((r) => r.total > 0)
            .map((r) => {
              const value = Math.round((r.agree / r.total) * 100);
              return (
                <li key={r.id}>
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="text-zinc-300">{r.label}</span>
                    <span className="font-mono text-zinc-400">
                      {r.agree}/{r.total}
                      {r.near !== undefined && r.near !== r.agree && (
                        <span className="text-zinc-600"> · {r.near}/{r.total} within one step</span>
                      )}
                    </span>
                  </div>
                  <Bar value={value} band={scoreBand(value)} />
                </li>
              );
            })}
        </ul>
      </div>

      <div className="rounded border border-zinc-800 bg-zinc-950/50 p-3 text-xs text-zinc-400">
        {comparison.stricter ? (
          <p>
            <span className={GRADER_ACCENT[comparison.stricter.grader]}>{GRADER_LABELS[comparison.stricter.grader]}</span>{" "}
            is the stricter grader on this answer: on the points both rated, it scored quality{" "}
            {comparison.stricter.steps.toFixed(1)} step{comparison.stricter.steps >= 1.05 ? "s" : ""} lower on average
            (the steps are wrong, vague, correct, justified).
          </p>
        ) : (
          <p>Neither model is systematically harsher here: on average their quality labels land within a quarter step.</p>
        )}
      </div>

      <div>
        <SectionLabel>Where they split ({comparison.splits.length})</SectionLabel>
        {comparison.splits.length === 0 ? (
          <p className="text-xs text-zinc-500">
            No point got different relevance or quality labels. When two models agree on every point, the verdict is
            harder to argue with.
          </p>
        ) : (
          <ul className="space-y-4">
            {comparison.splits.map((p) => (
              <li key={p.point.id}>
                <SpokenQuote>{p.point.quote}</SpokenQuote>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {GRADERS.map((g) => (
                    <OpinionBox key={g} grader={g} rating={p[g]} />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-zinc-500">
          A split point is not credited in the verdict above. Two models trained differently disagreeing is a signal
          that the point was ambiguous as spoken; say it more directly next time.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p className={cx("mt-1 font-mono text-xl font-semibold", accent ?? "text-zinc-100")}>{value}</p>
      <p className="text-[11px] text-zinc-500">{sub}</p>
    </div>
  );
}

function OpinionBox({ grader, rating }: { grader: GraderId; rating: PointRating | null }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950/50 p-2.5">
      <p className={cx("text-[11px] font-semibold", GRADER_ACCENT[grader])}>{GRADER_LABELS[grader]}</p>
      {rating ? (
        <>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={cx("rounded border px-1.5 py-0.5 text-[10px] font-medium", QUALITY_STYLE[rating.quality])}>
              {QUALITY_LABELS[rating.quality]}
            </span>
            <span className={cx("text-[10px]", RELEVANCE_STYLE[rating.relevance])}>
              {RELEVANCE_LABELS[rating.relevance]}
            </span>
          </div>
          {rating.reason && <p className="mt-1.5 text-xs leading-relaxed text-zinc-300">{rating.reason}</p>}
          {rating.rubricLine && (
            <p className="mt-1.5 text-[11px] text-zinc-500">
              Supports: <span className="text-zinc-400">{rating.rubricLine}</span>
            </p>
          )}
        </>
      ) : (
        <p className="mt-1 text-xs text-zinc-500">No valid rating for this point.</p>
      )}
    </div>
  );
}

// --- points -------------------------------------------------------------------

function PointsTab({ outcome }: { outcome: GradedOutcome }) {
  const [onlySplits, setOnlySplits] = useState(false);
  const points = onlySplits ? outcome.points.filter((p) => p.disputed) : outcome.points;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-zinc-400">
          Nano first split your answer into {outcome.points.length} point{outcome.points.length === 1 ? "" : "s"}, each
          an exact fragment of what you said. Then both models labelled every one, and gave a reason.
        </p>
        <label className="flex items-center gap-1.5 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={onlySplits}
            onChange={(e) => setOnlySplits(e.target.checked)}
            className="accent-amber-400"
          />
          Only splits
        </label>
      </div>
      <ol className="space-y-4">
        {points.map((p) => (
          <li key={p.point.id} className="rounded-lg border border-zinc-800 bg-zinc-950/30 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] text-zinc-500">{p.point.id}</span>
              {p.disputed ? (
                <Badge tone="bad">Models disagree</Badge>
              ) : p.quality ? (
                <span className={cx("rounded border px-1.5 py-0.5 text-[11px] font-medium", QUALITY_STYLE[p.quality])}>
                  Agreed: {QUALITY_LABELS[p.quality]}
                </span>
              ) : (
                <Badge>One opinion</Badge>
              )}
              {p.relevance && !p.disputed && (
                <span className={cx("text-[11px]", RELEVANCE_STYLE[p.relevance])}>{RELEVANCE_LABELS[p.relevance]}</span>
              )}
            </div>
            <SpokenQuote>{p.point.quote}</SpokenQuote>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {GRADERS.map((g) => (
                <OpinionBox key={g} grader={g} rating={p[g]} />
              ))}
            </div>
          </li>
        ))}
      </ol>
      {points.length === 0 && <p className="text-xs text-zinc-500">No split points on this answer.</p>}

      <div className="mt-6">
        <SectionLabel>Question parts</SectionLabel>
        <ul className="space-y-3">
          {outcome.parts.map((part) => (
            <li key={part.part} className="rounded-lg border border-zinc-800 bg-zinc-950/30 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={part.status === "addressed" ? "good" : part.status === "disputed" ? "accent" : "bad"}>
                  {part.status === "addressed" ? "Addressed" : part.status === "disputed" ? "Disputed" : "Not addressed"}
                </Badge>
                <span className="text-sm text-zinc-200">{part.part}</span>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {GRADERS.map((g) => {
                  const r = part[g];
                  return (
                    <div key={g} className="text-xs">
                      <span className={cx("font-semibold", GRADER_ACCENT[g])}>{GRADER_LABELS[g]}: </span>
                      {r === null ? (
                        <span className="text-zinc-500">no answer</span>
                      ) : r.addressed ? (
                        <span className="text-zinc-300">addressed, citing &ldquo;{r.quote}&rdquo;</span>
                      ) : (
                        <span className="text-zinc-500">not addressed</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// --- key points ---------------------------------------------------------------

const KEY_STATUS: Record<KeyPointStatus, { label: string; style: string }> = {
  supported: { label: "Landed", style: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  weak: { label: "Touched, weakly", style: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  absent: { label: "Not said", style: "border-zinc-700 text-zinc-500" },
};

function KeyPointsTab({ analysis, outcome }: { analysis: ReturnType<typeof analyse>; outcome: GradedOutcome }) {
  return (
    <div>
      <p className="mb-4 text-xs text-zinc-400">
        The ideas an interviewer listens for on this question, and whether each model heard you say them. A point
        only counts as landing a key idea when the model rated it correct or justified and tied it to that idea.
      </p>
      <ul className="space-y-3">
        {analysis.keyPoints.map((row) => (
          <li key={row.line} className="rounded-lg border border-zinc-800 bg-zinc-950/30 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-sm text-zinc-200">{row.line}</p>
              {row.gapFor.length > 0 && (
                <Badge tone="bad">
                  Named as the gap by {row.gapFor.map((g) => GRADER_LABELS[g]).join(" and ")}
                </Badge>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-3">
              {GRADERS.map((g) => {
                const cell = row[g];
                return (
                  <div key={g} className="flex items-center gap-1.5 text-xs">
                    <span className={cx("font-semibold", GRADER_ACCENT[g])}>{GRADER_LABELS[g]}</span>
                    {cell ? (
                      <>
                        <span className={cx("rounded border px-1.5 py-0.5 text-[10px]", KEY_STATUS[cell.status].style)}>
                          {KEY_STATUS[cell.status].label}
                        </span>
                        {cell.pointIds.length > 0 && (
                          <span className="font-mono text-[10px] text-zinc-500">from {cell.pointIds.join(", ")}</span>
                        )}
                      </>
                    ) : (
                      <span className="text-zinc-500">no answer</span>
                    )}
                  </div>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      {outcome.gap && (
        <div className="mt-4 rounded border border-rose-500/30 bg-rose-500/5 p-3">
          <p className="text-[11px] font-medium text-rose-300">The agreed gap</p>
          <p className="mt-1 text-sm text-zinc-200">{outcome.gap.rubricLine}</p>
          <div className="mt-2">
            <SpokenQuote>{outcome.gap.quote}</SpokenQuote>
          </div>
          <p className="mt-2 text-xs text-zinc-400">{outcome.gap.plainLanguage}</p>
        </div>
      )}
    </div>
  );
}

// --- skills -------------------------------------------------------------------

function SkillsTab({ outcome }: { outcome: GradedOutcome }) {
  if (outcome.skills.length === 0) {
    return <p className="text-sm text-zinc-400">This question has no written skill levels.</p>;
  }
  return (
    <div className="space-y-5">
      <p className="text-xs text-zinc-400">
        Each skill has four written levels. Both models read your whole answer and picked the level that describes it;
        when between two, they were told to pick the lower. The levels are the same words you see here.
      </p>
      {outcome.skills.map((s) => (
        <div key={s.skill.name}>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium text-zinc-200">{s.skill.name}</p>
            <p className="text-xs text-zinc-500">
              {GRADERS.map((g) => (
                <span key={g} className="ml-3">
                  <span className={GRADER_ACCENT[g]}>{GRADER_LABELS[g]}</span> {s[g] ?? "–"}/4
                </span>
              ))}
            </p>
          </div>
          <ol className="space-y-1.5">
            {s.skill.levels.map((text, i) => {
              const level = i + 1;
              const who = GRADERS.filter((g) => s[g] === level);
              return (
                <li
                  key={level}
                  className={cx(
                    "flex gap-3 rounded border p-2 text-xs",
                    who.length > 0 ? "border-zinc-600 bg-zinc-800/50 text-zinc-200" : "border-zinc-800 text-zinc-500",
                  )}
                >
                  <span className="w-4 shrink-0 font-mono">{level}</span>
                  <span className="flex-1">{text}</span>
                  <span className="flex shrink-0 gap-1">
                    {who.map((g) => (
                      <span key={g} className={cx("h-2 w-2 self-center rounded-full", GRADER_BAR[g])} title={GRADER_LABELS[g]} />
                    ))}
                  </span>
                </li>
              );
            })}
          </ol>
          {s.nano !== null && s.ultra !== null && s.nano !== s.ultra && (
            <p className="mt-1.5 text-[11px] text-amber-300">
              The models are {Math.abs(s.nano - s.ultra)} level{Math.abs(s.nano - s.ultra) === 1 ? "" : "s"} apart. The
              next level up from the lower reading is what to aim for.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// --- pipeline -----------------------------------------------------------------

const PURPOSE_LABELS: Partial<Record<OutboundCall["purpose"], string>> = {
  extract: "Split into points",
  "rate-nano": "Nano rates",
  "rate-ultra": "Ultra rates",
  repair: "Repair answer",
};

function PipelineTab({ outcome, trace }: { outcome: GradedOutcome; trace: TraceEntry[] }) {
  const calls = outcome.calls;
  const maxMs = Math.max(1, ...calls.map((c) => c.ms));
  const tokens = calls.reduce((a, c) => a + (c.promptTokens ?? 0) + (c.completionTokens ?? 0), 0);
  return (
    <div className="space-y-5">
      <ol className="space-y-2 text-xs text-zinc-400">
        <li>
          <span className="text-zinc-200">1. Split.</span> {outcome.models.extract ?? "The extract model"} breaks your
          transcript into points. Any fragment that is not word for word in your transcript is thrown away.
        </li>
        <li>
          <span className="text-zinc-200">2. Rate, in parallel.</span> Nano and Ultra get the identical prompt: the
          question, its parts, the key points, the skill levels, and your numbered points.
        </li>
        <li>
          <span className="text-zinc-200">3. Gate.</span> Labels outside the allowed set, quotes you never said, and key
          points that were never supplied are dropped before anything is shown.
        </li>
        <li>
          <span className="text-zinc-200">4. Compare.</span> Agreements stand. Disagreements are shown, never averaged.
        </li>
      </ol>

      {calls.length > 0 && (
        <div>
          <SectionLabel>Calls</SectionLabel>
          <ul className="space-y-2">
            {calls.map((c, i) => (
              <li key={i}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                  <span className="text-zinc-300">
                    {PURPOSE_LABELS[c.purpose] ?? c.purpose}{" "}
                    <span className="font-mono text-[10px] text-zinc-600">{c.model}</span>
                  </span>
                  <span className={cx("font-mono", c.ok ? "text-zinc-400" : "text-rose-300")}>
                    {c.ok ? `${(c.ms / 1000).toFixed(1)}s` : "failed"}
                    {c.promptTokens !== null && (
                      <span className="text-zinc-600">
                        {" "}
                        · {c.promptTokens}+{c.completionTokens ?? 0} tok
                      </span>
                    )}
                  </span>
                </div>
                <Bar value={(c.ms / maxMs) * 100} tone={c.ok ? "bg-zinc-500" : "bg-rose-400"} />
                {c.error && <p className="mt-0.5 text-[11px] text-rose-300">{c.error}</p>}
              </li>
            ))}
          </ul>
          {tokens > 0 && <p className="mt-2 text-[11px] text-zinc-500">{tokens.toLocaleString()} tokens in total.</p>}
        </div>
      )}

      <p className="text-[11px] text-zinc-500">
        {outcome.replay
          ? "These were saved responses, replayed through the same gate."
          : "Live calls to NVIDIA Nemotron on Nebius Token Factory."}
      </p>

      {trace.length > 0 && (
        <div>
          <SectionLabel>Why the interviewer asked this</SectionLabel>
          <ul className="space-y-1 text-[11px]">
            {trace.map((t, i) => (
              <li key={i} className="flex flex-wrap gap-x-2">
                <span className={cx("font-mono", t.fallback ? "text-amber-300" : "text-zinc-400")}>{t.tool}</span>
                <span className="text-zinc-400">{t.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}