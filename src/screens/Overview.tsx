import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { COACH_SUMMARY, accuracyLine } from "@/data/accuracy";
import { FEATURED_SESSIONS } from "@/data/featured";
import { GRADER_LABELS } from "@/lib/analysis";
import { historyStats, loadHistory, mergeEntries } from "@/lib/history";
import LiveTally from "@/components/LiveTally";
import PipelineDiagram from "@/components/PipelineDiagram";
import { findTopic } from "@/data/topics";
import { ArrowRightIcon, CheckIcon, LockIcon, MicIcon, QuoteIcon, ScaleIcon, TargetIcon } from "@/components/icons";
import { Button, Card, cx } from "@/components/ui";

function Section({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-20">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-nv">{eyebrow}</p>
      <h2 className="mt-2 max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-zinc-50 sm:text-4xl">
        {title}
      </h2>
      {lead && <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-400">{lead}</p>}
      <div className="mt-8">{children}</div>
    </section>
  );
}

/** The three things an interviewer weighs, in order, and which of them a checklist can see. */
const QUESTIONS = [
  { q: "Did you answer the question that was asked?", checklist: false },
  { q: "Was what you said correct, and did you give the reason?", checklist: false },
  { q: "What important idea did you leave out?", checklist: true },
];

const TRACK = [
  {
    icon: TargetIcon,
    need: "Persistent memory",
    have: "The miss log keeps the one gap from every answer, and it only closes when you cover it with the reason on a different question.",
  },
  {
    icon: ScaleIcon,
    need: "Reusable skills",
    have: "Rate a spoken answer. Pick the next question from your open gaps. Repair an answer using your own sentences.",
  },
  {
    icon: LockIcon,
    need: "Only the tools and data you choose",
    have: "No account. Progress stays in this browser. Only the transcript and the rubric lines are sent to Nemotron.",
  },
];

export default function Overview() {
  const entries = useMemo(() => mergeEntries(loadHistory(), FEATURED_SESSIONS), []);
  const stats = useMemo(() => historyStats(entries), [entries]);
  const agreePct = stats.agreement ? Math.round((stats.agreement.agree / stats.agreement.total) * 100) : null;
  const allReplay = stats.sessions > 0 && stats.liveSessions === 0;

  const tiles = [
    { label: "Sessions recorded", value: stats.sessions, tone: "text-zinc-50" },
    { label: "Answers rated", value: stats.answersRated, tone: "text-zinc-50" },
    { label: "Points rated by Nemotron", value: stats.pointsRated, tone: "text-nv" },
    {
      label: "Nano and Ultra agreed",
      value: agreePct === null ? "–" : `${agreePct}%`,
      tone: "text-nv",
      sub: stats.agreement ? `${stats.agreement.agree} of ${stats.agreement.total} decisions` : undefined,
    },
    { label: "Gaps closed", value: stats.gapsClosed, tone: "text-emerald-300" },
  ];

  return (
    <div className="-mt-8 pb-8">
      {/* hero */}
      <header className="relative overflow-hidden pb-4 pt-16 text-center sm:pt-24">
        <div className="bg-grid pointer-events-none absolute inset-0" aria-hidden />
        <div
          className="pointer-events-none absolute left-1/2 top-0 h-72 w-[40rem] -translate-x-1/2 rounded-full bg-nv/20 blur-3xl"
          aria-hidden
        />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-nv/40 bg-nv/10 px-3 py-1 text-xs font-medium text-nv">
            <span className="h-1.5 w-1.5 rounded-full bg-nv" aria-hidden />
            Personal AI track · NVIDIA Nemotron on Nebius Token Factory
          </span>
          <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-semibold leading-[1.08] tracking-tight text-zinc-50 sm:text-6xl">
            Interview prep tells you what you skipped.{" "}
            <span className="bg-gradient-to-r from-nv to-amber-300 bg-clip-text text-transparent">
              Not how good what you said was.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-zinc-400 sm:text-lg">
            sixty is a spoken interview coach for engineers moving into AI roles. Two NVIDIA Nemotron models rate every
            point you actually made, quote your own words as proof, and remember the one gap to test next.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/" className="w-full sm:w-auto">
              <Button variant="primary" size="lg" className="w-full">
                <MicIcon className="h-5 w-5" />
                Try the coach
              </Button>
            </Link>
            <Link to="/history" className="w-full sm:w-auto">
              <Button size="lg" className="w-full">
                Read a recorded session
                <ArrowRightIcon className="h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* live usage: shows nothing until a database is connected and someone has finished an interview */}
      <LiveTally topicTitle={(id) => findTopic(id)?.title ?? id} />

      {/* problem */}
      <Section
        eyebrow="The problem"
        title="A checklist can only answer the third question."
        lead="An interviewer weighs three things, in this order. Most drills reduce them to a list of ideas you did or did not mention."
      >
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
          <div className="hidden grid-cols-[1fr_8rem_8rem] gap-4 border-b border-zinc-800 px-5 py-3 text-xs font-medium uppercase tracking-wider text-zinc-500 sm:grid">
            <span>What an interviewer asks</span>
            <span className="text-center">Typical drill</span>
            <span className="text-center text-nv">sixty</span>
          </div>
          <ul className="divide-y divide-zinc-800">
            {QUESTIONS.map((row, i) => (
              <li key={row.q} className="grid items-center gap-3 px-5 py-4 sm:grid-cols-[1fr_8rem_8rem] sm:gap-4">
                <p className="text-base text-zinc-100">
                  <span className="mr-3 font-mono text-sm text-zinc-600">0{i + 1}</span>
                  {row.q}
                </p>
                <p className="flex items-center gap-2 text-sm sm:justify-center">
                  <span className="text-xs text-zinc-500 sm:hidden">Typical drill:</span>
                  {row.checklist ? (
                    <span className="inline-flex items-center gap-1 text-zinc-300">
                      <CheckIcon className="h-4 w-4" /> Sees it
                    </span>
                  ) : (
                    <span className="text-zinc-600">Blind to it</span>
                  )}
                </p>
                <p className="flex items-center gap-2 text-sm sm:justify-center">
                  <span className="text-xs text-zinc-500 sm:hidden">sixty:</span>
                  <span className="inline-flex items-center gap-1 font-medium text-nv">
                    <CheckIcon className="h-4 w-4" /> Rated
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* approach */}
      <Section
        eyebrow="What we built"
        title="Two Nemotron models read your answer. Code checks their work."
        lead="The green steps are live Nemotron calls through Nebius Token Factory. Everything between them is deterministic code, so a model cannot invent evidence."
      >
        <PipelineDiagram />

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <Card>
            <QuoteIcon className="h-5 w-5 text-nv" />
            <h3 className="mt-3 text-base font-semibold text-zinc-100">Every rating cites you</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
              A quote that is not word for word in your transcript is thrown away before you see anything. A model
              cannot praise something you never said.
            </p>
          </Card>
          <Card>
            <ScaleIcon className="h-5 w-5 text-nv" />
            <h3 className="mt-3 text-base font-semibold text-zinc-100">Disagreement is a signal</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
              <span className="text-violet-300">{GRADER_LABELS.nano}</span> and{" "}
              <span className="text-teal-300">{GRADER_LABELS.ultra}</span> rate independently. Where they split, you see
              both views, and the stricter reading stands.
            </p>
          </Card>
          <Card>
            <TargetIcon className="h-5 w-5 text-nv" />
            <h3 className="mt-3 text-base font-semibold text-zinc-100">One gap, then proof you fixed it</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
              The coach asks a different question aimed at the same idea. The gap closes only when you cover it, with
              the reason.
            </p>
          </Card>
        </div>
      </Section>

      {/* proof */}
      <Section
        eyebrow="The evidence"
        title="Numbers from real sessions, not a slide."
        lead="These add up the sessions saved in this browser plus the featured recordings shipped with the app."
      >
        {stats.answersRated === 0 ? (
          <Card className="flex flex-col items-center py-10 text-center">
            <p className="text-base font-medium text-zinc-100">No recorded sessions yet</p>
            <p className="mt-1 max-w-md text-sm text-zinc-500">
              Answer a question and this fills in from the real Nemotron ratings. Nothing here is made up.
            </p>
            <Link to="/" className="mt-4">
              <Button variant="primary">Record a session</Button>
            </Link>
          </Card>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {tiles.map((t) => (
                <div key={t.label} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                  <dd className={cx("font-mono text-3xl font-semibold tabular-nums", t.tone)}>{t.value}</dd>
                  <dt className="mt-1 text-xs text-zinc-400">{t.label}</dt>
                  {t.sub && <p className="mt-0.5 text-xs text-zinc-600">{t.sub}</p>}
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-zinc-500">
              {allReplay
                ? "All of these sessions are replays of saved responses, not live model calls. Record a live session to replace them."
                : `${stats.liveSessions} of ${stats.sessions} session${stats.sessions === 1 ? " was" : "s were"} live Nemotron calls.`}{" "}
              <Link to="/history" className="underline hover:text-zinc-300">
                Read them
              </Link>
              .
            </p>
          </>
        )}

        {COACH_SUMMARY.measured && (
          <Card className="mt-4 border-nv/30">
            <p className="text-sm font-medium text-zinc-100">Measured against human graders</p>
            <ul className="mt-2 space-y-1 text-sm text-zinc-300">
              {(["nano", "ultra", "combined"] as const).map((g) => (
                <li key={g}>
                  <span className="font-medium text-zinc-100">{g === "combined" ? "Both together" : GRADER_LABELS[g]}:</span>{" "}
                  {accuracyLine(g)}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-zinc-500">
              Agreement between the two models is not the score. Agreement with people is.
            </p>
          </Card>
        )}
      </Section>

      {/* track */}
      <Section
        eyebrow="Why Personal AI"
        title="An assistant that remembers, has skills, and stays in your hands."
      >
        <ul className="grid gap-4 md:grid-cols-3">
          {TRACK.map((t) => (
            <li key={t.need}>
              <Card className="h-full">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-nv/15 text-nv">
                  <t.icon className="h-5 w-5" />
                </span>
                <p className="mt-3 text-xs font-medium uppercase tracking-wider text-zinc-500">{t.need}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-300">{t.have}</p>
              </Card>
            </li>
          ))}
        </ul>
      </Section>

      <p className="mt-16 text-center text-sm text-zinc-500">
        Built with NVIDIA Nemotron Nano and Ultra on Nebius Token Factory · React and TypeScript · browser speech
        recognition for input.
      </p>
    </div>
  );
}
