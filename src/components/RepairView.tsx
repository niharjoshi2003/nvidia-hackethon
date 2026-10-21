import type { RepairOutcome } from "@/agent/repairAnswer";
import { Card, SectionLabel } from "./ui";

/** The repaired answer: the candidate's own sentences, plus only what they missed, each addition tagged. */
export default function RepairView({ repair }: { repair: RepairOutcome | null }) {
  if (!repair) {
    return (
      <Card>
        <p className="text-sm text-zinc-300">Nothing was missed, so there is nothing to repair.</p>
      </Card>
    );
  }
  if (repair.status !== "repaired") {
    return (
      <Card className="border-zinc-700">
        <p className="text-sm text-zinc-300">The repaired answer is unavailable.</p>
        <p className="mt-1 text-sm text-zinc-500">{repair.detail}</p>
      </Card>
    );
  }
  return (
    <Card className="animate-fade-up">
      <SectionLabel>Your answer, repaired</SectionLabel>
      <p className="mb-4 text-sm text-zinc-400">
        Your own sentences, plus only what you missed. Every added sentence is tagged with the rubric line it
        covers; untagged additions were dropped{repair.repair.dropped > 0 ? ` (${repair.repair.dropped} here)` : ""}.
      </p>
      <div className="space-y-2">
        {repair.repair.sentences.map((s, i) =>
          s.rubricLine ? (
            <div key={i} className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3">
              <p className="text-base leading-relaxed text-emerald-50">{s.text}</p>
              <p className="mt-1 text-xs text-emerald-300/80">Added for: {s.rubricLine}</p>
            </div>
          ) : (
            <p key={i} className="px-1 text-base leading-relaxed text-zinc-400">
              {s.text}
            </p>
          ),
        )}
      </div>
    </Card>
  );
}
