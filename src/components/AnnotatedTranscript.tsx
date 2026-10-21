import { useMemo, useState } from "react";
import { locatePoints } from "@/lib/summary";
import { QUALITY_LABELS, type CombinedPoint, type Quality } from "@/types";
import { OpinionBox } from "./Analysis";
import { GRADERS, GRADER_LABELS } from "@/lib/analysis";
import { Card, SectionLabel, cx } from "./ui";

const MARK: Record<Quality, string> = {
  justified: "bg-emerald-400/20 text-emerald-50 decoration-emerald-400 hover:bg-emerald-400/30",
  correct: "bg-sky-400/20 text-sky-50 decoration-sky-400 hover:bg-sky-400/30",
  vague: "bg-amber-400/20 text-amber-50 decoration-amber-400 hover:bg-amber-400/30",
  wrong: "bg-rose-400/25 text-rose-50 decoration-rose-400 hover:bg-rose-400/35",
};
const DISPUTED_MARK = "bg-violet-400/15 text-violet-50 decoration-violet-400 decoration-dashed hover:bg-violet-400/25";

const LEGEND: Array<{ label: string; dot: string }> = [
  { label: QUALITY_LABELS.justified, dot: "bg-emerald-400" },
  { label: QUALITY_LABELS.correct, dot: "bg-sky-400" },
  { label: QUALITY_LABELS.vague, dot: "bg-amber-400" },
  { label: QUALITY_LABELS.wrong, dot: "bg-rose-400" },
  { label: "Models disagree", dot: "bg-violet-400" },
];

const markClass = (p: CombinedPoint) =>
  p.disputed || !p.quality ? DISPUTED_MARK : MARK[p.quality];

/**
 * The candidate's own transcript with every rated point highlighted by quality.
 * Selecting a point shows what each model said about it and why.
 */
export default function AnnotatedTranscript({
  transcript,
  points,
}: {
  transcript: string;
  points: CombinedPoint[];
}) {
  const located = useMemo(() => locatePoints(transcript, points), [transcript, points]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = points.find((p) => p.point.id === selectedId) ?? null;
  const placed = located.segments.filter((s) => s.point).length;

  if (placed === 0) return null;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <SectionLabel>What you said, rated</SectionLabel>
        <p className="text-xs text-zinc-500">Tap a highlight to see why</p>
      </div>

      <p className="text-base leading-8 text-zinc-300">
        {located.segments.map((segment, i) =>
          segment.point ? (
            <button
              key={i}
              type="button"
              onClick={() => setSelectedId((id) => (id === segment.point!.point.id ? null : segment.point!.point.id))}
              aria-pressed={selectedId === segment.point.point.id}
              className={cx(
                "rounded px-1 py-0.5 text-left underline decoration-2 underline-offset-4 transition-colors",
                markClass(segment.point),
                selectedId === segment.point.point.id && "ring-2 ring-zinc-200/70",
              )}
            >
              {segment.text}
            </button>
          ) : (
            <span key={i}>{segment.text}</span>
          ),
        )}
      </p>

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-zinc-400" aria-label="Legend">
        {LEGEND.map((item) => (
          <li key={item.label} className="flex items-center gap-1.5">
            <span className={cx("h-2 w-2 rounded-full", item.dot)} aria-hidden />
            {item.label}
          </li>
        ))}
      </ul>

      {selected ? (
        <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-950/60 p-3" role="region" aria-label="Why this was rated">
          <p className="mb-2 text-sm text-zinc-300">
            {selected.disputed
              ? "The two models disagreed on this point, so it is not credited."
              : selected.quality
                ? `Both models rated this ${QUALITY_LABELS[selected.quality].toLowerCase()}.`
                : "Only one model rated this point."}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {GRADERS.map((g) => (
              <OpinionBox key={g} grader={g} rating={selected[g]} />
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs text-zinc-500">
          {GRADERS.map((g) => GRADER_LABELS[g]).join(" and ")} each rated these points independently.
          {located.unplaced.length > 0 &&
            ` ${located.unplaced.length} rated point${located.unplaced.length === 1 ? "" : "s"} could not be matched to the text and ${located.unplaced.length === 1 ? "is" : "are"} shown in the proof.`}
        </p>
      )}
    </Card>
  );
}
