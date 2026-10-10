import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/hooks/useStore";
import { latestOpenMiss } from "@/lib/misses";
import { SOURCE_LABELS, TRACK_LABELS, type Track } from "@/types";
import { Badge, Button, Card, PageTitle, cx } from "@/components/ui";

const TRACKS = Object.keys(TRACK_LABELS) as Track[];

export default function Library() {
  const { state, topics } = useStore();
  const [track, setTrack] = useState<Track | "all">("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return topics.filter(
      (t) =>
        (track === "all" || t.track === track) &&
        (!q || t.title.toLowerCase().includes(q) || t.framing.toLowerCase().includes(q)),
    );
  }, [topics, track, query]);

  return (
    <div>
      <PageTitle sub={`${topics.length} topics, each with a rubric the evaluator must cite`}>
        Library
      </PageTitle>

      <div className="mb-5 space-y-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search topics"
          className="w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
        />
        <div className="flex flex-wrap gap-1.5">
          {(["all", ...TRACKS] as const).map((value) => (
            <button
              key={value}
              onClick={() => setTrack(value)}
              className={cx(
                "rounded border px-2.5 py-1 text-xs transition-colors",
                track === value
                  ? "border-zinc-500 text-zinc-100"
                  : "border-zinc-800 text-zinc-500 hover:border-zinc-700",
              )}
            >
              {value === "all" ? "All" : TRACK_LABELS[value]}
            </button>
          ))}
        </div>
      </div>

      <ul className="space-y-3">
        {filtered.map((topic) => {
          const miss = latestOpenMiss(state.misses, topic.id);
          const attempts = state.progress[topic.id]?.attempts ?? 0;
          return (
            <li key={topic.id}>
              <Card>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-zinc-500">{TRACK_LABELS[topic.track]}</span>
                      {miss && <Badge tone="accent">Open miss</Badge>}
                      {topic.sourceLabel && <Badge>{SOURCE_LABELS[topic.sourceLabel]}</Badge>}
                      {topic.source === "imported" && <Badge>Imported</Badge>}
                      {attempts > 0 && (
                        <span className="text-xs text-zinc-600">
                          {attempts} attempt{attempts === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-medium text-zinc-100">{topic.title}</h3>
                    <p className="mt-1 text-sm text-zinc-500">{topic.framing}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Link to={`/research/${topic.id}`}>
                      <Button size="sm" variant="ghost">
                        Prepare
                      </Button>
                    </Link>
                    <Link to={`/explain/${topic.id}`}>
                      <Button size="sm">Speak</Button>
                    </Link>
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      {filtered.length === 0 && (
        <p className="text-sm text-zinc-500">Nothing matches that search.</p>
      )}
    </div>
  );
}
