import { useStore } from "@/hooks/useStore";
import { missPatterns, openMisses } from "@/lib/misses";
import { MissCard } from "@/components/MissCard";
import { Button, Card, Empty, PageTitle, SectionLabel } from "@/components/ui";

export default function Progress() {
  const { state, topics, resolveMiss } = useStore();
  const byId = new Map(topics.map((t) => [t.id, t]));
  const open = openMisses(state.misses);
  const patterns = missPatterns(state.misses);
  const stats = state.gradeStats;

  if (state.attempts.length === 0) {
    return (
      <div>
        <PageTitle>Progress</PageTitle>
        <Empty title="Nothing here yet">
          Speak on a topic and this fills with what you missed and what changed.
        </Empty>
      </div>
    );
  }

  return (
    <div>
      <PageTitle sub={`${state.attempts.length} attempts recorded in this browser`}>
        Progress
      </PageTitle>

      {/* The refusal rate is deliberately given equal billing with the success
          rate. An evaluator that never declines is not more trustworthy. */}
      {stats.attempted > 0 && (
        <Card className="mb-6">
          <SectionLabel>The evaluator&rsquo;s own record</SectionLabel>
          <div className="flex flex-wrap gap-x-10 gap-y-3">
            <Figure value={stats.accepted} label="grades backed by a quote" />
            <Figure value={stats.clean} label="complete, nothing invented" />
            <Figure value={stats.rejected} label="declined, could not cite" tone="bad" />
            <Figure value={stats.failed} label="did not run" />
          </div>
          <p className="mt-3 text-sm text-zinc-500">
            A declined grade means the model wrote something it could not tie to your words and a
            rubric line, so it was thrown away rather than shown to you.
          </p>
        </Card>
      )}

      {patterns.length > 0 && (
        <Card className="mb-6">
          <SectionLabel>What kind of thing you miss</SectionLabel>
          <ul className="space-y-2.5">
            {patterns.map((pattern) => (
              <li key={pattern.category}>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-sm text-zinc-200">{pattern.label}</span>
                  <span className="shrink-0 font-mono text-xs text-zinc-500">
                    {pattern.count} on {pattern.topicIds.length} topic
                    {pattern.topicIds.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="mt-1 h-1 w-full rounded-full bg-zinc-800">
                  <div
                    className="h-1 rounded-full bg-amber-400"
                    style={{ width: `${Math.round(pattern.share * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-zinc-500">
            Share of all {state.misses.length} misses, grouped by kind rather than by topic.
          </p>
        </Card>
      )}

      <SectionLabel>Open misses</SectionLabel>
      {open.length === 0 ? (
        <Empty title="Nothing open">
          Every miss has been resolved, so your plan is back to its normal schedule.
        </Empty>
      ) : (
        <ul className="space-y-3">
          {open.map((miss) => (
            <li key={miss.id}>
              <p className="mb-1.5 text-xs text-zinc-500">
                {byId.get(miss.topicId)?.title ?? miss.topicId}
              </p>
              <MissCard miss={miss} showProvenance />
              <div className="mt-2">
                <Button size="sm" onClick={() => resolveMiss(miss.id)}>
                  Mark resolved
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Figure({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone?: "bad";
}) {
  return (
    <div>
      <p
        className={
          tone === "bad"
            ? "font-mono text-2xl text-rose-300"
            : "font-mono text-2xl text-zinc-100"
        }
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-zinc-500">{label}</p>
    </div>
  );
}
