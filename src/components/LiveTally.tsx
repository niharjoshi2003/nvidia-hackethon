import { useStats } from "@/hooks/useStats";
import type { PublicStats } from "@/lib/telemetrySchema";
import { BAND_LABELS } from "@/lib/analysis";
import { Card, cx } from "./ui";

/**
 * The public usage tally: how many people have taken an interview and how it went.
 *
 * It renders nothing at all when there is no database behind it (local dev with
 * no setup, a failed request, or zero interviews so far). A row of zeros under a
 * heading that says "live" would read as a launch nobody tried.
 */

const BAND_TONE = {
  strong: "bg-emerald-400",
  solid: "bg-nv",
  developing: "bg-amber-400",
  "not-yet": "bg-rose-400",
} as const;

const BAND_ORDER = ["strong", "solid", "developing", "not-yet"] as const;

const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** One line for the landing page. */
export function LiveTallyLine() {
  const state = useStats();
  if (state.status !== "ready" || state.stats.interviews === 0) return null;
  const { interviews, visitors, averageScore } = state.stats;
  return (
    <p className="mt-3 text-sm text-zinc-400" data-testid="live-tally-line">
      <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-nv align-middle" aria-hidden />
      {plural(interviews, "interview", "interviews")} taken by {plural(visitors, "person", "people")}
      {averageScore !== null && <> · average score {averageScore}</>}
    </p>
  );
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
      <p className="text-3xl font-semibold tabular-nums tracking-tight text-zinc-50">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{label}</p>
    </div>
  );
}

function Daily({ stats }: { stats: PublicStats }) {
  const max = Math.max(1, ...stats.daily.map((d) => d.interviews));
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Interviews, last 14 days</p>
      <div className="mt-3 flex h-20 items-end gap-1" role="img" aria-label="Interviews per day for the last 14 days">
        {stats.daily.map((d) => (
          <div
            key={d.date}
            title={`${d.date}: ${d.interviews}`}
            className={cx("flex-1 rounded-t", d.interviews > 0 ? "bg-nv/80" : "bg-zinc-800")}
            style={{ height: `${Math.max(6, (d.interviews / max) * 100)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function Bands({ stats }: { stats: PublicStats }) {
  const total = BAND_ORDER.reduce((sum, b) => sum + stats.bands[b], 0);
  if (total === 0) return null;
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">How interviews were rated</p>
      <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-zinc-800" role="img" aria-label="Share of interviews by verdict">
        {BAND_ORDER.map((b) =>
          stats.bands[b] > 0 ? (
            <div key={b} className={BAND_TONE[b]} style={{ width: `${(stats.bands[b] / total) * 100}%` }} />
          ) : null,
        )}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
        {BAND_ORDER.map((b) => (
          <li key={b} className="flex items-center gap-1.5">
            <span className={cx("h-2 w-2 rounded-full", BAND_TONE[b])} aria-hidden />
            {BAND_LABELS[b]} {stats.bands[b]}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The full panel for the Overview page. */
export default function LiveTally({ topicTitle }: { topicTitle: (topicId: string) => string }) {
  const state = useStats();
  if (state.status !== "ready" || state.stats.interviews === 0) return null;
  const { stats } = state;

  return (
    <section className="mt-16" aria-label="Live usage" data-testid="live-tally">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-nv">Live usage</p>
      <h2 className="mt-2 max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-zinc-50 sm:text-4xl">
        {plural(stats.interviews, "interview", "interviews")} so far, by {plural(stats.visitors, "person", "people")}.
      </h2>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-400">
        Counted from finished interviews, as scores only. No answer text or audio is ever sent. Visitors can switch the
        count off before they start.
      </p>

      <Card className="mt-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile value={stats.answersRated.toLocaleString()} label="spoken answers rated by two Nemotron models" />
          <Tile value={stats.averageScore === null ? "n/a" : String(stats.averageScore)} label="average interview score, out of 100" />
          <Tile value={stats.agreementPct === null ? "n/a" : `${stats.agreementPct}%`} label="of points both models rated the same way" />
          <Tile value={stats.coveragePct === null ? "n/a" : `${stats.coveragePct}%`} label="of asked rubric lines covered by answers" />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Daily stats={stats} />
          <Bands stats={stats} />
        </div>

        {stats.topics.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">By interview</p>
            <ul className="mt-3 divide-y divide-zinc-800 text-sm">
              {stats.topics.slice(0, 10).map((t) => (
                <li key={t.topicId} className="flex items-center justify-between gap-4 py-2">
                  <span className="min-w-0 truncate text-zinc-200">{topicTitle(t.topicId)}</span>
                  <span className="shrink-0 tabular-nums text-zinc-400">
                    {plural(t.interviews, "interview", "interviews")}
                    {t.averageScore !== null && <> · avg {t.averageScore}</>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-5 text-xs text-zinc-500">
          Numbers are reported by each visitor&apos;s browser, so this is a usage tally, not an audit.
        </p>
      </Card>
    </section>
  );
}
