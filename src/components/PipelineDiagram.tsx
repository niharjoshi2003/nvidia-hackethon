import type { ComponentType, SVGProps } from "react";
import { CheckIcon, MicIcon, QuoteIcon, ScaleIcon, TargetIcon } from "./icons";
import { cx } from "./ui";

type Kind = "human" | "nemotron" | "code" | "memory";

interface Node {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  kind: Kind;
  tag: string;
  title: string;
  body: string;
  /** Sub-chips shown inside the node, e.g. the two parallel raters. */
  chips?: Array<{ label: string; tone: string }>;
}

const NODES: Node[] = [
  {
    icon: MicIcon,
    kind: "human",
    tag: "You",
    title: "Speak",
    body: "You answer out loud. Browser speech-to-text types it, and you fix any mis-heard words before grading.",
  },
  {
    icon: QuoteIcon,
    kind: "nemotron",
    tag: "Nemotron Nano",
    title: "Extract points",
    body: "Nano splits the transcript into the points you made, each an exact fragment of what you said.",
  },
  {
    icon: ScaleIcon,
    kind: "nemotron",
    tag: "Nano + Ultra, in parallel",
    title: "Rate every point",
    body: "Both models rate each point on the same rubric, with the same prompt, without seeing each other.",
    chips: [
      { label: "Nano", tone: "border-violet-400/40 bg-violet-400/10 text-violet-300" },
      { label: "Ultra", tone: "border-teal-400/40 bg-teal-400/10 text-teal-300" },
    ],
  },
  {
    icon: CheckIcon,
    kind: "code",
    tag: "Plain code, not a model",
    title: "Gate and combine",
    body: "Every quote must really be in your words or it is dropped. Where the models disagree, both views are shown.",
  },
  {
    icon: TargetIcon,
    kind: "memory",
    tag: "Memory",
    title: "One gap, remembered",
    body: "The single idea that would most change an interviewer's mind goes in the miss log, and leads your next session.",
  },
];

const KIND: Record<Kind, { ring: string; icon: string; tag: string }> = {
  human: { ring: "border-amber-400/40", icon: "bg-amber-400/15 text-amber-300", tag: "text-amber-300" },
  nemotron: { ring: "border-nv/50 glow-nv", icon: "bg-nv/15 text-nv", tag: "text-nv" },
  code: { ring: "border-zinc-600", icon: "bg-zinc-700/50 text-zinc-200", tag: "text-zinc-400" },
  memory: { ring: "border-emerald-400/40", icon: "bg-emerald-400/15 text-emerald-300", tag: "text-emerald-300" },
};

/** An animated dashed arrow. Horizontal on wide screens, vertical when the nodes stack. */
function Connector({ tone }: { tone: Kind }) {
  const stroke = tone === "nemotron" ? "stroke-nv" : "stroke-zinc-500";
  return (
    <>
      <svg width="40" height="24" viewBox="0 0 40 24" className="hidden shrink-0 self-center md:block" aria-hidden>
        <path d="M2 12h30" className={cx("flow-line fill-none", stroke)} strokeWidth="2" strokeLinecap="round" />
        <path d="m30 6 7 6-7 6" className={cx("fill-none", stroke)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <svg width="24" height="32" viewBox="0 0 24 32" className="mx-auto shrink-0 md:hidden" aria-hidden>
        <path d="M12 2v22" className={cx("flow-line fill-none", stroke)} strokeWidth="2" strokeLinecap="round" />
        <path d="m6 22 6 7 6-7" className={cx("fill-none", stroke)} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </>
  );
}

/** How an answer becomes a rating, left to right. Green nodes are the Nemotron calls. */
export default function PipelineDiagram() {
  return (
    <ol className="flex flex-col md:flex-row md:items-stretch" aria-label="How an answer is rated">
      {NODES.map((node, i) => {
        const style = KIND[node.kind];
        const next = NODES[i + 1];
        return (
          <li key={node.title} className="flex flex-col md:flex-1 md:flex-row">
            <div
              className={cx(
                "flex-1 rounded-xl border bg-zinc-900/70 p-4 backdrop-blur",
                style.ring,
              )}
            >
              <div className="mb-3 flex items-center gap-2.5">
                <span className={cx("inline-flex h-9 w-9 items-center justify-center rounded-lg", style.icon)}>
                  <node.icon className="h-5 w-5" />
                </span>
                <span className="font-mono text-xs text-zinc-600">0{i + 1}</span>
              </div>
              <p className={cx("text-xs font-medium uppercase tracking-wider", style.tag)}>{node.tag}</p>
              <h3 className="mt-1 text-base font-semibold text-zinc-50">{node.title}</h3>
              {node.chips && (
                <div className="mt-2 flex gap-1.5">
                  {node.chips.map((c) => (
                    <span key={c.label} className={cx("rounded border px-2 py-0.5 text-xs font-medium", c.tone)}>
                      {c.label}
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{node.body}</p>
            </div>
            {next && <Connector tone={node.kind === "nemotron" || next.kind === "nemotron" ? "nemotron" : "code"} />}
          </li>
        );
      })}
    </ol>
  );
}
