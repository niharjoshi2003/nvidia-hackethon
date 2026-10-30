import { useEffect, useRef, useState } from "react";
import { fetchStudySources, type StudySourcesResult } from "@/lib/studySources";
import { Badge, Button, Card, SectionLabel } from "./ui";

export default function StudySources(props: { topicId: string; rubricLine?: string | null }) {
  const topicId = props.topicId.split("#")[0]!;
  return <StudySourcesPanel key={`${topicId}:${props.rubricLine ?? ""}`} topicId={topicId} rubricLine={props.rubricLine} />;
}

function StudySourcesPanel({ topicId, rubricLine }: { topicId: string; rubricLine?: string | null }) {
  const [result, setResult] = useState<StudySourcesResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  const search = async () => {
    if (busy) return;
    if (result) { setOpen((value) => !value); return; }
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setError(""); setOpen(true);
    try {
      const data = await fetchStudySources({ topicId, ...(rubricLine ? { rubricLine } : {}) }, { signal: controller.signal });
      if (!controller.signal.aborted) setResult(data);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Study sources could not be loaded.");
    } finally { if (!controller.signal.aborted) setBusy(false); }
  };

  return (
    <Card className="border-nv/30" aria-label="Study sources from Tavily">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <SectionLabel>Keep practising</SectionLabel>
          <p className="text-sm text-zinc-200">Find reading material for this interview idea.</p>
          {rubricLine && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">{rubricLine}</p>}
        </div>
        <Button onClick={() => void search()} disabled={busy} aria-expanded={open}>
          {busy ? "Searching Tavily…" : result ? open ? "Hide study sources" : "Show study sources" : "Find sources with Tavily"}
        </Button>
      </div>
      <p className="mt-3 text-xs text-zinc-500">Only the public study topic is sent to Tavily. Your answer stays out of this search.</p>
      {busy && <p className="mt-3 text-sm text-nv" role="status">Looking for documentation and practical examples…</p>}
      {error && <p className="mt-3 text-sm text-amber-300" role="alert">{error}</p>}
      {open && result && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <Badge tone="good">Powered by Tavily</Badge>
            <span>{result.results.length} source{result.results.length === 1 ? "" : "s"}</span>
            <span>Retrieved {new Date(result.retrievedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          {result.results.length ? (
            <ul className="space-y-3">
              {result.results.map((source) => (
                <li key={source.url} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                  <a href={source.url} target="_blank" rel="noopener noreferrer" className="font-medium text-nv underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-400">
                    {source.title}
                  </a>
                  <p className="mt-1 text-xs text-zinc-500">{new URL(source.url).hostname}</p>
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-zinc-400">{source.content}</p>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-zinc-400">No matching documentation was found for this idea.</p>}
          <details className="text-xs text-zinc-500">
            <summary className="cursor-pointer">Search details</summary>
            <p className="mt-2 break-words">Query: {result.query}</p>
            {result.requestId && <p className="mt-1 break-all">Tavily request: {result.requestId}</p>}
            <p className="mt-1">{result.cached ? "Previously retrieved results from the short-lived search cache." : "Retrieved by a live Tavily Search API call."}</p>
          </details>
          <p className="text-xs text-zinc-500">These links support further study. They do not change the rubric or your recorded ratings.</p>
        </div>
      )}
    </Card>
  );
}
