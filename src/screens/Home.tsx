import { Link } from "react-router-dom";
import { useStore } from "@/hooks/useStore";
import { useDailyPlan } from "@/hooks/useDailyPlan";
import { dominantPattern, latestOpenMiss } from "@/lib/misses";
import { TRACK_LABELS } from "@/types";
import { Badge, Button, Card, Empty, PageTitle, SectionLabel } from "@/components/ui";

export default function Home() {
  const { state, topics } = useStore();
  const plan = useDailyPlan();
  const pattern = dominantPattern(state.misses);
  const byId = new Map(topics.map((t) => [t.id, t]));

  const openCount = new Set(
    state.misses.filter((m) => m.status === "open").map((m) => m.topicId),
  ).size;

  return (
    <div>
      <PageTitle
        sub={
          openCount > 0
            ? `${openCount} topic${openCount === 1 ? "" : "s"} with an open miss, leading today's plan.`
            : "Speak for a minute. Find out what you skipped."
        }
      >
        Today
      </PageTitle>

      {/* The cross-topic insight. Only appears once there is enough evidence
          to be a statement about the person rather than about one topic. */}
      {pattern && (
        <Card className="mb-6 border-amber-500/30 bg-amber-500/5">
          <SectionLabel>A habit across your answers</SectionLabel>
          <p className="text-sm text-zinc-100">
            <span className="font-medium">{pattern.label.toLowerCase()}</span> in {pattern.count} of{" "}
            {state.misses.length} misses, across {pattern.topicIds.length} different topics.
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            No single session could show you this. It only appears when the same kind of gap keeps
            turning up on unrelated material.
          </p>
        </Card>
      )}

      <SectionLabel>Your plan</SectionLabel>
      {plan.length === 0 ? (
        <Empty title="No topics available">
          Import a rubric in Settings, or check back once the library loads.
        </Empty>
      ) : (
        <ul className="space-y-3">
          {plan.map((entry) => {
            const topic = byId.get(entry.topicId);
            if (!topic) return null;
            const miss = entry.slot === "open-miss" ? latestOpenMiss(state.misses, topic.id) : null;

            return (
              <li key={entry.topicId}>
                <Card className={entry.slot === "open-miss" ? "border-amber-500/30" : undefined}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <Badge tone={entry.slot === "open-miss" ? "accent" : "neutral"}>
                          {entry.reason}
                        </Badge>
                        <span className="text-xs text-zinc-500">{TRACK_LABELS[topic.track]}</span>
                      </div>
                      <h3 className="text-base font-medium text-zinc-100">{topic.title}</h3>
                      {miss ? (
                        <p className="mt-1.5 text-sm text-zinc-400">{miss.plainLanguage}</p>
                      ) : (
                        <p className="mt-1.5 text-sm text-zinc-500">{topic.framing}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Link to={`/research/${topic.id}`}>
                        <Button size="sm" variant="ghost">
                          Prepare
                        </Button>
                      </Link>
                      <Link to={`/explain/${topic.id}`}>
                        <Button size="sm" variant="primary">
                          Speak
                        </Button>
                      </Link>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {state.gradeStats.attempted > 0 && (
        <p className="mt-6 text-xs text-zinc-500">
          The evaluator has graded {state.gradeStats.accepted + state.gradeStats.clean} of{" "}
          {state.gradeStats.attempted}{" "}
          answers
          {state.gradeStats.rejected > 0 && (
            <> and declined {state.gradeStats.rejected} it could not back with a quote</>
          )}
          . <Link to="/progress" className="underline hover:text-zinc-300">See the record</Link>.
        </p>
      )}
    </div>
  );
}
