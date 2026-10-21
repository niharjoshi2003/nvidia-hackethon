import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { FEATURED_SESSIONS } from "@/data/featured";
import { useStore } from "@/hooks/useStore";
import { analyse, BAND_LABELS, bandFor, type GradedOutcome, type VerdictBand } from "@/lib/analysis";
import {
  historyStats,
  loadHistory,
  mergeEntries,
  parseHistoryFile,
  removeSession,
  saveHistory,
  serialiseHistory,
  upsertSession,
  type HistoryEntry,
  type SavedSession,
} from "@/lib/history";
import { ROLE_LABELS, type Topic } from "@/types";
import SessionThread from "@/components/SessionThread";
import { ArrowRightIcon, MicIcon } from "@/components/icons";
import { Badge, Button, Card, cx } from "@/components/ui";

type Filter = "all" | "live" | "replay" | "featured";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "live", label: "Live" },
  { id: "replay", label: "Replay" },
  { id: "featured", label: "Featured" },
];

const DOT: Record<VerdictBand, string> = {
  strong: "bg-emerald-400",
  solid: "bg-sky-400",
  developing: "bg-amber-400",
  "not-yet": "bg-rose-400",
};

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface Scores {
  nano: number | null;
  ultra: number | null;
  band: VerdictBand | null;
}

/** Average of each model's score across the graded rounds of a session. */
function sessionScores(entry: SavedSession, topicById: Map<string, Topic>): Scores {
  const nano: number[] = [];
  const ultra: number[] = [];
  for (const round of entry.rounds) {
    const topic = topicById.get(round.topicId);
    if (!topic || round.outcome?.status !== "graded") continue;
    const reading = analyse(topic, round.outcome as GradedOutcome);
    for (const v of reading.verdicts) {
      if (v.score === null) continue;
      (v.grader === "nano" ? nano : ultra).push(v.score);
    }
  }
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const n = avg(nano);
  const u = avg(ultra);
  const lower = [n, u].filter((x): x is number => x !== null);
  return { nano: n, ultra: u, band: lower.length ? bandFor(Math.min(...lower)) : null };
}

export default function History() {
  const { id } = useParams();
  const { topics } = useStore();
  const topicById = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);

  const [local, setLocal] = useState<SavedSession[]>(() => loadHistory());
  const [filter, setFilter] = useState<Filter>("all");
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const entries = useMemo(() => mergeEntries(local, FEATURED_SESSIONS), [local]);
  const visible = entries.filter(
    (e) =>
      filter === "all" ||
      (filter === "featured" ? e.featured : filter === "live" ? e.source === "live" : e.source === "replay"),
  );
  const selected = entries.find((e) => e.id === id) ?? null;
  const stats = useMemo(() => historyStats(entries), [entries]);

  const persist = (next: SavedSession[]) => {
    setLocal(next);
    if (!saveHistory(next)) {
      setNotice({ tone: "bad", text: "The browser refused to save. Export your sessions so they are not lost." });
    }
  };

  const onImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const parsed = parseHistoryFile(await file.text());
    if (!parsed.ok) {
      setNotice({ tone: "bad", text: parsed.error });
      return;
    }
    persist(parsed.sessions.reduce(upsertSession, local));
    setNotice({
      tone: "ok",
      text: `Imported ${parsed.sessions.length} session${parsed.sessions.length === 1 ? "" : "s"}.`,
    });
  };

  const remove = (entry: HistoryEntry) => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    persist(removeSession(local, entry.id));
    setConfirmDelete(false);
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">History</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Every session, kept whole: what was asked, what you said, and what both Nemotron models returned.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={onImport} />
          <Button size="sm" onClick={() => fileInput.current?.click()}>
            Import
          </Button>
          <Button
            size="sm"
            disabled={local.length === 0}
            onClick={() => download("showcase.json", serialiseHistory(local))}
            title="Save as src/data/showcase.json and commit it to feature these sessions in the deployed demo"
          >
            Export my sessions
          </Button>
        </div>
      </div>

      {notice && (
        <p
          role="status"
          className={cx("mb-4 text-sm", notice.tone === "ok" ? "text-emerald-300" : "text-rose-300")}
        >
          {notice.text}
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-[320px_minmax(0,1fr)]">
        {/* list */}
        <aside className={cx(id ? "hidden md:block" : "block")} aria-label="Sessions">
          <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter sessions">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
                className={cx(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  filter === f.id
                    ? "border-amber-400 bg-amber-400 font-medium text-zinc-950"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <EmptyList hasAny={entries.length > 0} />
          ) : (
            <ul className="space-y-2">
              {visible.map((entry) => {
                const scores = sessionScores(entry, topicById);
                const active = entry.id === id;
                return (
                  <li key={entry.id}>
                    <Link
                      to={`/history/${encodeURIComponent(entry.id)}`}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "block rounded-lg border p-3 transition-colors",
                        active
                          ? "border-amber-400/60 bg-amber-400/5"
                          : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-600",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-2 text-sm font-medium text-zinc-100">{entry.title}</p>
                        {scores.band && (
                          <span
                            className={cx("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", DOT[scores.band])}
                            title={BAND_LABELS[scores.band]}
                          />
                        )}
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">{when(entry.startedAt)}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {entry.featured && <Badge tone="good">Featured</Badge>}
                        {entry.source === "replay" && <Badge>Replay</Badge>}
                        {entry.mode === "thread" && <Badge tone="accent">Interview</Badge>}
                        <span className="text-xs text-zinc-500">
                          {entry.rounds.length} {entry.mode === "thread" ? "turn" : "answer"}
                          {entry.rounds.length === 1 ? "" : "s"}
                        </span>
                        {scores.nano !== null && (
                          <span className="font-mono text-xs text-zinc-400">
                            <span className="text-violet-300">{scores.nano}</span>
                            <span className="text-zinc-600"> / </span>
                            <span className="text-teal-300">{scores.ultra ?? "–"}</span>
                          </span>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {entries.length > 0 && (
            <p className="mt-4 text-xs leading-relaxed text-zinc-500">
              {stats.answersRated} answers rated, {stats.pointsRated} points, {stats.gapsClosed} gap
              {stats.gapsClosed === 1 ? "" : "s"} closed.
              <br />
              <span className="font-mono">
                <span className="text-violet-300">Nano</span> / <span className="text-teal-300">Ultra</span>
              </span>{" "}
              scores are averages across answers.
            </p>
          )}
        </aside>

        {/* detail */}
        <section className={cx(id ? "block" : "hidden md:block")} aria-label="Session">
          {selected ? (
            <>
              <Link
                to="/history"
                className="mb-4 inline-flex items-center gap-1 rounded text-sm text-zinc-400 hover:text-zinc-200 md:hidden"
              >
                ← All sessions
              </Link>
              <Header
                entry={selected}
                scores={sessionScores(selected, topicById)}
                onExport={() =>
                  download(
                    `sixty-session-${selected.startedAt.slice(0, 10)}.json`,
                    serialiseHistory([selected]),
                  )
                }
                onDelete={() => remove(selected)}
                confirming={confirmDelete}
                onCancel={() => setConfirmDelete(false)}
              />
              <SessionThread entry={selected} topicById={topicById} />
            </>
          ) : id ? (
            <Card className="text-center">
              <p className="text-sm font-medium text-zinc-200">That session is not in this browser.</p>
              <p className="mt-1 text-sm text-zinc-500">
                It may have been deleted, or it was saved in another browser.{" "}
                <Link to="/history" className="underline hover:text-zinc-300">
                  Back to history
                </Link>
              </p>
            </Card>
          ) : (
            <Card className="flex flex-col items-center py-14 text-center">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-nv/15 text-nv">
                <ArrowRightIcon className="h-6 w-6" />
              </span>
              <p className="mt-4 text-base font-medium text-zinc-100">Pick a session to read it back</p>
              <p className="mt-1 max-w-sm text-sm text-zinc-500">
                You will see the question, your answer with every point highlighted, and how Nano and Ultra rated it.
              </p>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}

function Header({
  entry,
  scores,
  onExport,
  onDelete,
  confirming,
  onCancel,
}: {
  entry: HistoryEntry;
  scores: Scores;
  onExport: () => void;
  onDelete: () => void;
  confirming: boolean;
  onCancel: () => void;
}) {
  const facts = [
    { label: "Answers", value: String(entry.rounds.length), tone: "text-zinc-50" },
    { label: "Nano", value: scores.nano === null ? "–" : String(scores.nano), tone: "text-violet-300" },
    { label: "Ultra", value: scores.ultra === null ? "–" : String(scores.ultra), tone: "text-teal-300" },
    { label: "Gaps closed", value: String(entry.closed.length), tone: "text-emerald-300" },
  ];
  return (
    <Card className="mb-8 border-nv/30 bg-gradient-to-br from-nv/10 to-zinc-900/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {entry.featured && <Badge tone="good">Featured</Badge>}
            <Badge tone={entry.source === "live" ? "accent" : "neutral"}>
              {entry.source === "live" ? "Live Nemotron" : "Replay"}
            </Badge>
            {entry.role && <span className="text-xs text-zinc-500">{ROLE_LABELS[entry.role]}</span>}
          </div>
          <h2 className="text-xl font-semibold text-zinc-50">{entry.title}</h2>
          <p className="mt-0.5 text-sm text-zinc-500">{when(entry.startedAt)}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={onExport}>
            Export
          </Button>
          {!entry.featured &&
            (confirming ? (
              <>
                <Button size="sm" variant="danger" onClick={onDelete}>
                  Confirm delete
                </Button>
                <Button size="sm" variant="ghost" onClick={onCancel}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={onDelete}>
                Delete
              </Button>
            ))}
        </div>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {facts.map((f) => (
          <div key={f.label} className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
            <dd className={cx("font-mono text-2xl font-semibold", f.tone)}>{f.value}</dd>
            <dt className="text-xs text-zinc-500">{f.label}</dt>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function EmptyList({ hasAny }: { hasAny: boolean }) {
  if (hasAny) {
    return <p className="rounded-lg border border-zinc-800 p-4 text-sm text-zinc-500">No sessions match this filter.</p>;
  }
  return (
    <Card className="text-center">
      <span className="mx-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-400/10 text-amber-300">
        <MicIcon className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-medium text-zinc-200">Nothing recorded yet</p>
      <p className="mt-1 text-sm text-zinc-500">
        Answer a question and the whole session is saved here automatically.
      </p>
      <Link to="/" className="mt-4 inline-block">
        <Button size="sm" variant="primary">
          Start a session
        </Button>
      </Link>
    </Card>
  );
}
