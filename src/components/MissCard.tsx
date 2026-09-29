import { MISS_CATEGORY_LABELS, type SpokenMiss } from "@/types";
import { Badge, Card, SpokenQuote, RubricLine, cx } from "./ui";

/**
 * The evaluator's finding, shown as evidence rather than as advice.
 *
 * Order is deliberate: what you said, then the rubric line it missed, then the
 * explanation. The two citations come first because they are checkable and the
 * prose is not — a reader can disagree with the explanation while still seeing
 * exactly what it is based on.
 */
export function MissCard({
  miss,
  compact = false,
  showProvenance = false,
  className,
}: {
  miss: SpokenMiss;
  compact?: boolean;
  showProvenance?: boolean;
  className?: string;
}) {
  return (
    <Card className={cx(className)}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone={miss.status === "open" ? "accent" : "good"}>
          {miss.status === "open" ? "Open miss" : "Resolved"}
        </Badge>
        <span className="text-sm font-medium text-zinc-100">{miss.missType}</span>
        <Badge>{MISS_CATEGORY_LABELS[miss.category]}</Badge>
      </div>

      <p className="text-sm text-zinc-200">{miss.plainLanguage}</p>

      {!compact && (
        <div className="mt-4 space-y-3">
          <div>
            <p className="mb-1 text-xs uppercase tracking-wider text-zinc-500">You said</p>
            <SpokenQuote>{miss.quote}</SpokenQuote>
          </div>
          <div>
            <p className="mb-1 text-xs uppercase tracking-wider text-zinc-500">
              The rubric line it missed
            </p>
            <RubricLine>{miss.rubricLine}</RubricLine>
          </div>
        </div>
      )}

      {showProvenance && miss.calls.length > 0 && (
        <div className="mt-4 border-t border-zinc-800 pt-3">
          <p className="mb-1.5 text-xs uppercase tracking-wider text-zinc-500">
            Which models ran
          </p>
          <ul className="space-y-1">
            {miss.calls.map((call, i) => (
              <li key={i} className="flex flex-wrap gap-x-2 font-mono text-[11px] text-zinc-500">
                <span className="text-zinc-400">{call.model}</span>
                <span>
                  {call.purpose === "coverage" ? "found what you covered" : "chose the miss"}
                </span>
                <span>{call.ms}ms</span>
                {call.promptTokens != null && (
                  <span>
                    {call.promptTokens}+{call.completionTokens} tok
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-zinc-600">
            Nebius Token Factory. Your recording stayed in this browser; only the transcript and
            this topic&rsquo;s rubric were sent.
          </p>
        </div>
      )}
    </Card>
  );
}
