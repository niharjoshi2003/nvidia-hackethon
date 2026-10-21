import { useEffect, useState } from "react";
import { CheckIcon } from "./icons";
import { Card, cx } from "./ui";

const STEPS = [
  { title: "Splitting your answer into points", model: "Nemotron Nano", detail: "Each point is an exact fragment of what you said." },
  { title: "Rating every point, in parallel", model: "Nano + Ultra", detail: "Same points, same rubric, same prompt, two models." },
  { title: "Checking every quote against your words", model: "Citation gate", detail: "Anything you never said is thrown away." },
] as const;

/**
 * Shown while the models work. The order of the steps is the real pipeline; the
 * timing is not a progress bar, so the last running step simply keeps spinning
 * until the result arrives.
 */
export default function GradingPanel() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setStep(1), 3500);
    return () => clearTimeout(t);
  }, []);

  return (
    <Card className="mb-4 animate-fade-up" role="status" aria-live="polite">
      <p className="shimmer-text text-lg font-semibold">Two Nemotron models are reading your answer…</p>
      <ol className="mt-5 space-y-4">
        {STEPS.map((s, i) => {
          const state = i < step ? "done" : i === step ? "active" : "pending";
          return (
            <li key={s.title} className="flex items-start gap-3">
              <span
                className={cx(
                  "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                  state === "done" && "border-emerald-500/50 bg-emerald-500/10 text-emerald-300",
                  state === "active" && "border-amber-400/60 text-amber-300",
                  state === "pending" && "border-zinc-700 text-zinc-600",
                )}
              >
                {state === "done" ? (
                  <CheckIcon className="h-3.5 w-3.5" />
                ) : state === "active" ? (
                  <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" aria-hidden />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-700" aria-hidden />
                )}
              </span>
              <div>
                <p className={cx("text-sm", state === "pending" ? "text-zinc-500" : "text-zinc-100")}>
                  {s.title} <span className="ml-1 font-mono text-xs text-zinc-500">{s.model}</span>
                </p>
                <p className="text-xs text-zinc-500">{s.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
