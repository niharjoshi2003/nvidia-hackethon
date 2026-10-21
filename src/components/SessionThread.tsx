import { useMemo, type ReactNode } from "react";
import { TURN_LABELS } from "@/data/threads";
import { locatePoints } from "@/lib/summary";
import { applyView, turnFromSaved, type ScoredTurn } from "@/lib/thread";
import { wordCount } from "@/lib/text";
import type { HistoryEntry, HistoryRound } from "@/lib/history";
import type { Topic } from "@/types";
import AnnotatedTranscript from "./AnnotatedTranscript";
import GradedResult from "./GradedResult";
import { CheckIcon, MicIcon, SparkIcon } from "./icons";
import ThreadScorecard from "./ThreadScorecard";
import { Badge, Card, cx } from "./ui";

const roundLabel = (kind: HistoryRound["kind"]) =>
  kind === "opening"
    ? "Interviewer · question"
    : kind === "followup"
      ? "Interviewer · follow-up"
      : `Interviewer · ${TURN_LABELS[kind].toLowerCase()}`;

type Who = "interviewer" | "you" | "nemotron";

const AVATAR: Record<Who, string> = {
  interviewer: "border-zinc-700 bg-zinc-800 text-zinc-300",
  you: "border-amber-400/50 bg-amber-400/15 text-amber-300",
  nemotron: "border-nv/50 bg-nv/15 text-nv",
};

function Message({
  who,
  label,
  meta,
  children,
}: {
  who: Who;
  label: string;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3 sm:gap-4">
      <span
        className={cx(
          "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
          AVATAR[who],
        )}
        aria-hidden
      >
        {who === "interviewer" ? "Q" : who === "you" ? <MicIcon className="h-4 w-4" /> : <SparkIcon className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="mb-1.5 flex flex-wrap items-center gap-x-2 text-sm font-medium text-zinc-200">
          {label}
          {meta && <span className="text-xs font-normal text-zinc-500">{meta}</span>}
        </p>
        {children}
      </div>
    </div>
  );
}

/**
 * A saved session read back like a conversation: what was asked, what you said,
 * and everything Nemotron returned about it. Nothing here calls a model.
 */
export default function SessionThread({
  entry,
  topicById,
}: {
  entry: HistoryEntry;
  topicById: Map<string, Topic>;
}) {
  // An interview thread opens with what it added up to, then the turns that made it.
  const base = entry.mode === "thread" ? topicById.get(entry.rounds[0]!.topicId) : undefined;
  const scored: ScoredTurn[] = useMemo(
    () =>
      base
        ? entry.rounds.map((r, i) => ({
            turn: turnFromSaved(
              base,
              // Thread rounds always carry a turn kind; the guard only narrows the type.
              { kind: r.kind === "opening" || r.kind === "followup" ? "scoped" : r.kind, prompt: r.prompt, view: r.view! },
              i,
            ),
            outcome: r.outcome,
          }))
        : [],
    [base, entry.rounds],
  );

  return (
    <div className="space-y-8">
      {base && entry.rounds.every((r) => r.view) && <ThreadScorecard topic={base} turns={scored} />}
      {entry.rounds.map((round, i) => (
        <RoundThread key={i} round={round} index={i} entry={entry} topic={topicById.get(round.topicId)} />
      ))}

      {entry.repair && (
        <Message
          who="nemotron"
          label="Your answer, repaired"
          meta="your sentences, plus only what you missed"
        >
          <Card>
            <div className="space-y-2">
              {entry.repair.sentences.map((s, i) =>
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
            {entry.repair.dropped > 0 && (
              <p className="mt-3 text-xs text-zinc-500">
                {entry.repair.dropped} untagged addition{entry.repair.dropped === 1 ? " was" : "s were"} dropped.
              </p>
            )}
          </Card>
        </Message>
      )}

      {entry.closed.length > 0 && (
        <Card className="border-emerald-500/40 bg-emerald-500/10">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-400/15 text-emerald-300">
              <CheckIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-emerald-300">
                Gap{entry.closed.length === 1 ? "" : "s"} closed in this session
              </p>
              {entry.closed.map((c, i) => (
                <p key={i} className="mt-1 text-sm text-emerald-50">
                  &ldquo;{c.missType}&rdquo; from <span className="text-emerald-200/80">{c.topicTitle}</span>
                </p>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function RoundThread({
  round,
  index,
  entry,
  topic,
}: {
  round: HistoryRound;
  index: number;
  entry: HistoryEntry;
  topic: Topic | undefined;
}) {
  const outcome = round.outcome?.status === "graded" ? round.outcome : null;
  const words = wordCount(round.transcript);
  const hasHighlights =
    outcome !== null && locatePoints(round.transcript, outcome.points).segments.some((s) => s.point);

  return (
    <section className="space-y-5" aria-label={`Round ${index + 1}`}>
      <Message
        who="interviewer"
        label={roundLabel(round.kind)}
        meta={round.topicTitle}
      >
        <p className="text-lg leading-relaxed text-zinc-100">{round.prompt}</p>
        {round.reason && <p className="mt-1.5 text-sm text-zinc-500">{round.reason}</p>}
      </Message>

      <Message who="you" label="You" meta={`${round.spokenSeconds}s · ${words} word${words === 1 ? "" : "s"}`}>
        {outcome && hasHighlights ? (
          <AnnotatedTranscript transcript={round.transcript} points={outcome.points} />
        ) : (
          <Card>
            <p className="text-base leading-relaxed text-zinc-200">{round.transcript || "No transcript was saved."}</p>
          </Card>
        )}
      </Message>

      {!outcome && (
        <Message who="nemotron" label="NVIDIA Nemotron">
          <Card className="border-zinc-700">
            <Badge tone="bad">Not rated</Badge>
            <p className="mt-2 text-sm text-zinc-400">{unratedReason(round)}</p>
            <p className="mt-1 text-sm text-zinc-500">Your words above are kept. Nothing was invented in place of a rating.</p>
          </Card>
        </Message>
      )}

      {outcome && (
        <Message
          who="nemotron"
          label="NVIDIA Nemotron"
          meta={
            <>
              {outcome.models.nano && <span className="font-mono">{shortModel(outcome.models.nano)}</span>}
              {outcome.models.ultra && <span className="font-mono"> + {shortModel(outcome.models.ultra)}</span>}
            </>
          }
        >
          {topic ? (
            <GradedResult
              topic={round.view ? applyView(topic, round.view, `h${index}`) : topic}
              outcome={outcome}
              trace={index === 0 ? entry.trace : []}
              transcript={round.transcript}
              closed={[]}
              topicTitle={(id) => entry.closed.find((c) => c.topicId === id)?.topicTitle ?? id}
              hideTranscript
            />
          ) : (
            <Card>
              <Badge>Question not in the library</Badge>
              <p className="mt-2 text-sm text-zinc-400">
                This question is no longer available, so its full result cannot be redrawn. The transcript above is
                what was said.
              </p>
            </Card>
          )}
        </Message>
      )}
    </section>
  );
}

/** Why an answer has no rating, in words a candidate can act on. */
function unratedReason(round: HistoryRound): string {
  const o = round.outcome;
  if (o === null) return "The models had not finished rating this answer when the session was saved.";
  if (o.status === "skipped") return "The answer was too short to rate, so no model was called.";
  if (o.status === "failed") {
    return o.reason === "rate-limited" || o.reason === "quota-reached"
      ? "The shared demo budget was used up, so the grading request was refused. Add your own Token Factory key in Settings, or try again later."
      : `The grading call did not complete: ${o.detail}`;
  }
  return "This answer has no rating.";
}

/** "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B" reads better as "Nemotron-3-Nano-30B-A3B". */
function shortModel(model: string): string {
  return model.replace(/^nvidia\//i, "").replace(/^NVIDIA-/i, "");
}
