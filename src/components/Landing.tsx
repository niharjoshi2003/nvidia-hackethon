import { Link } from "react-router-dom";
import { ROLE_LABELS, type RoleTrack, type SpokenMiss } from "@/types";
import { ArrowRightIcon, CheckIcon, LockIcon, MicIcon, QuoteIcon, ScaleIcon, TargetIcon } from "./icons";
import { LiveTallyLine } from "./LiveTally";
import { Button, Card, cx } from "./ui";

/** One interview the visitor can choose directly instead of letting the interviewer pick. */
export interface InterviewOption {
  topicId: string;
  title: string;
  area: string;
  scene: string;
  /** Open gaps the coach already holds on this topic, shown so a returning visitor can aim at one. */
  openGaps: number;
}

interface LandingProps {
  onPick: (role: RoleTrack) => void;
  /** Starts one specific interview. */
  onChoose: (topicId: string) => void;
  interviews: InterviewOption[];
  /** Starts a session with a saved answer, so nobody needs a microphone to see the result. */
  onSample: () => void;
  /** One open miss per topic, newest first. */
  openMisses: SpokenMiss[];
  closedCount: number;
  topicTitle: (topicId: string) => string;
}

const STEPS = [
  {
    icon: MicIcon,
    title: "Take a short interview",
    body: "The interviewer asks five short questions out loud, 30 to 60 seconds each, and each one follows from your last answer. Your words are transcribed and you can fix them before sending.",
  },
  {
    icon: ScaleIcon,
    title: "Two Nemotron models rate it",
    body: "Nano and Ultra rate every point you made, independently. Where they disagree, you see both views. Nothing is averaged away.",
  },
  {
    icon: TargetIcon,
    title: "Fix the one gap",
    body: "You get the single idea that would most change an interviewer's mind. It stays open until you cover it on a different question.",
  },
] as const;

export default function Landing({
  onPick,
  onChoose,
  interviews,
  onSample,
  openMisses,
  closedCount,
  topicTitle,
}: LandingProps) {
  return (
    <div className="animate-fade-up">
      <section className="pb-10 pt-4 text-center sm:pt-10">
        <span className="inline-flex items-center gap-2 rounded-full border border-nv/40 bg-nv/10 px-3 py-1 text-xs font-medium text-nv">
          <span className="h-1.5 w-1.5 rounded-full bg-nv" aria-hidden />
          Runs on NVIDIA Nemotron via Nebius Token Factory
        </span>

        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight text-zinc-50 sm:text-6xl">
          Rate what you <span className="text-amber-400">actually said</span>.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-zinc-400 sm:text-lg">
          A spoken interview coach for engineers moving into AI roles. It judges your real answer
          point by point, and remembers what to test you on next.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {(Object.keys(ROLE_LABELS) as RoleTrack[]).map((role, i) => (
            <Button
              key={role}
              variant={i === 0 ? "primary" : "secondary"}
              size="lg"
              onClick={() => onPick(role)}
              className="w-full sm:w-auto"
            >
              <MicIcon className="h-5 w-5" />
              Start as {ROLE_LABELS[role]}
            </Button>
          ))}
        </div>
        <button
          type="button"
          onClick={onSample}
          className="mt-4 inline-flex items-center gap-1.5 rounded text-sm text-zinc-400 underline-offset-4 transition-colors hover:text-amber-300 hover:underline"
        >
          No microphone? Try a sample answer
          <ArrowRightIcon className="h-4 w-4" />
        </button>
        <LiveTallyLine />
        <p className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm text-zinc-500">
          <Link to="/overview" className="rounded underline-offset-4 hover:text-zinc-200 hover:underline">
            How it works
          </Link>
          <Link to="/history" className="rounded underline-offset-4 hover:text-zinc-200 hover:underline">
            Read recorded sessions
          </Link>
        </p>
      </section>

      {interviews.length > 0 && (
        <section aria-labelledby="choose-interview" className="mb-10">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <h2 id="choose-interview" className="text-lg font-semibold text-zinc-100">
              Or choose your interview
            </h2>
            <p className="text-xs text-zinc-500">
              {interviews.length} topics, five short spoken questions each
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {interviews.map((item) => (
              <li key={item.topicId}>
                <button
                  type="button"
                  onClick={() => onChoose(item.topicId)}
                  className="group flex h-full w-full flex-col rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-left transition-colors hover:border-amber-400/50 hover:bg-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
                >
                  <span className="flex items-center justify-between gap-2 text-xs">
                    <span className="rounded-full bg-nv/10 px-2 py-0.5 font-medium text-nv">
                      {item.area}
                    </span>
                    {item.openGaps > 0 && (
                      <span className="text-amber-300">
                        {item.openGaps} open gap{item.openGaps === 1 ? "" : "s"}
                      </span>
                    )}
                  </span>
                  <span className="mt-2 text-sm font-medium leading-snug text-zinc-100">{item.title}</span>
                  <span className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-zinc-400">
                    {item.scene}
                  </span>
                  <span className="mt-auto inline-flex items-center gap-1 pt-3 text-xs font-medium text-amber-300 transition-transform group-hover:translate-x-0.5">
                    Start this interview <ArrowRightIcon className="h-3.5 w-3.5" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(openMisses.length > 0 || closedCount > 0) && (
        <Card className="mb-8 border-amber-500/30 bg-amber-500/5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-amber-200">The coach remembers</h2>
            <p className="text-xs text-zinc-400">
              {openMisses.length} open gap{openMisses.length === 1 ? "" : "s"}
              {closedCount > 0 && <> · {closedCount} closed</>}
            </p>
          </div>
          {openMisses.length > 0 ? (
            <>
              <ul className="mt-3 space-y-2">
                {openMisses.slice(0, 3).map((miss) => (
                  <li key={miss.id} className="flex gap-2.5 text-sm">
                    <TargetIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                    <span>
                      <span className="text-zinc-100">{miss.plainLanguage}</span>
                      <span className="block text-xs text-zinc-500">{topicTitle(miss.topicId)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-zinc-400">
                Your next session starts from these. A gap only closes when you cover it, with the
                reason, on a different question.
              </p>
            </>
          ) : (
            <p className="mt-3 flex items-center gap-2 text-sm text-emerald-300">
              <CheckIcon className="h-4 w-4" /> Every gap so far is closed. Start fresh.
            </p>
          )}
        </Card>
      )}

      <section aria-label="How it works">
        <ol className="grid gap-3 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title}>
              <Card className="h-full transition-colors hover:border-zinc-700">
                <div className="mb-3 flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-amber-400/10 text-amber-300">
                    <step.icon className="h-5 w-5" />
                  </span>
                  <span className="font-mono text-xs text-zinc-500">0{i + 1}</span>
                </div>
                <h3 className="text-base font-medium text-zinc-100">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{step.body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section aria-label="Why you can trust the rating" className="mt-8">
        <ul
          className={cx(
            "grid gap-x-8 gap-y-3 rounded-lg border border-zinc-800 bg-zinc-900/30 px-5 py-4 text-sm text-zinc-400",
            "sm:grid-cols-3",
          )}
        >
          <li className="flex items-start gap-2.5">
            <QuoteIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            Every rating quotes your own words. A quote you never said is thrown away.
          </li>
          <li className="flex items-start gap-2.5">
            <ScaleIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            Two models rate independently, so a generous or harsh grader cannot decide alone.
          </li>
          <li className="flex items-start gap-2.5">
            <LockIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            No account. Your progress stays in this browser. The public tally counts scores only, and you can turn that off.
          </li>
        </ul>
      </section>
    </div>
  );
}
