import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useStore } from "@/hooks/useStore";
import { coachTopics } from "@/data/topics";
import { rateAnswer } from "@/agent/rateAnswer";
import { repairAnswer, type RepairOutcome } from "@/agent/repairAnswer";
import { hasReplay, replayFetch, replayFor, REPLAY_SOURCE } from "@/agent/replay";
import {
  Interviewer,
  plannedPolicy,
  type InterviewContext,
  type InterviewerPolicy,
} from "@/agent/interviewer";
import { buildCoachBrief } from "@/lib/coachBrief";
import {
  canAskFollowUp,
  currentRound,
  initialSession,
  loadSession,
  remainingSeconds,
  saveSession,
  sessionReducer,
  type Round,
} from "@/lib/session";
import {
  isTranscriptionSupported,
  startLiveTranscript,
  type LiveTranscript,
} from "@/audio/liveTranscript";
import {
  ROLE_LABELS,
  SOURCE_LABELS,
  type RatedOutcome,
  type RoleTrack,
  type SpokenMiss,
  type Topic,
  type TraceEntry,
} from "@/types";
import { Badge, Button, Card, PageTitle, SectionLabel, SpokenQuote } from "@/components/ui";
import Analysis from "@/components/Analysis";

/** Every tool throws, so the fixed rule has to carry the session. `?failTools=1` */
const failingPolicy: InterviewerPolicy = {
  pickNextQuestion: () => {
    throw new Error("forced failure");
  },
  getRubric: () => {
    throw new Error("forced failure");
  },
  pickFollowUp: () => {
    throw new Error("forced failure");
  },
};

export default function Coach() {
  const { state, saveCoachRound, updateSettings } = useStore();
  const [params] = useSearchParams();
  const policy = params.get("failTools") === "1" ? failingPolicy : plannedPolicy;
  const replay = state.settings.replayMode;

  const topics = useMemo(() => coachTopics(), []);
  const byId = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);

  const [session, dispatch] = useReducer(sessionReducer, initialSession, loadSession);
  const [closed, setClosed] = useState<SpokenMiss[]>([]);
  const [repair, setRepair] = useState<RepairOutcome | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => saveSession(session), [session]);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const round = currentRound(session);
  const topic = round ? byId.get(round.topicId) : undefined;

  const context = useCallback(
    (role: RoleTrack): InterviewContext => ({
      role,
      topics,
      misses: state.misses,
      askedTopicIds: session.rounds.map((r) => r.topicId),
    }),
    [topics, state.misses, session.rounds],
  );

  // --- interviewer steps ----------------------------------------------------

  const start = async (role: RoleTrack) => {
    dispatch({ type: "start", role, at: new Date().toISOString() });
    setClosed([]);
    setRepair(null);
    const agent = new Interviewer(policy);
    const ctx: InterviewContext = { role, topics, misses: state.misses, askedTopicIds: [] };
    const choice = await agent.pickNextQuestion(ctx);
    await agent.getRubric(choice.topicId, ctx);
    const picked = byId.get(choice.topicId);
    dispatch({ type: "trace", entries: agent.trace });
    dispatch({
      type: "ask",
      round: {
        topicId: choice.topicId,
        kind: "opening",
        prompt: picked?.framing ?? "",
        reason: choice.reason,
        targetLine: null,
      },
    });
  };

  const followUp = async () => {
    if (!session.role || !round) return;
    const agent = new Interviewer(policy);
    const ctx = context(session.role);
    let targetLine: string | null = null;
    if (round.outcome?.status === "graded") {
      const t = byId.get(round.topicId);
      targetLine =
        round.outcome.gap?.rubricLine ??
        (t ? buildCoachBrief(t, round.outcome).targetRubricLine : null);
    }
    const choice = await agent.pickFollowUp(ctx, round.topicId, targetLine);
    await agent.getRubric(choice.topicId, ctx);
    dispatch({ type: "trace", entries: agent.trace });
    dispatch({
      type: "ask",
      round: {
        topicId: choice.topicId,
        kind: "followup",
        prompt: choice.question,
        reason: choice.reason,
        targetLine: choice.targetLine,
      },
    });
  };

  // --- grading --------------------------------------------------------------

  const grade = async (transcript: string, spokenSeconds: number) => {
    if (!topic) return;
    dispatch({ type: "answer", transcript, spokenSeconds });
    const outcome = await rateAnswer({
      topic,
      transcript,
      ownApiKey: state.settings.ownApiKey || undefined,
      ...(replay ? { fetchImpl: replayFetch(topic.id) } : {}),
    });
    dispatch({ type: "graded", outcome });
    if (outcome.status === "graded") {
      const result = saveCoachRound({ topic, transcript, spokenSeconds, outcome });
      dispatch({ type: "saved", attemptId: result.attempt.id });
      setClosed((prev) => [...prev, ...result.closed]);
    }
  };

  const runRepair = async () => {
    const target = [...session.rounds].reverse().find((r) => missedFor(r).length > 0);
    dispatch({ type: "repair" });
    if (!target) {
      setRepair(null);
      return;
    }
    setRepair(
      await repairAnswer({
        transcript: target.transcript,
        missedLines: missedFor(target),
        ownApiKey: state.settings.ownApiKey || undefined,
        ...(replay ? { fetchImpl: replayFetch(target.topicId) } : {}),
      }),
    );
  };

  const reset = () => {
    dispatch({ type: "reset" });
    setClosed([]);
    setRepair(null);
  };

  // --- render ---------------------------------------------------------------

  const left = remainingSeconds(session, now);

  return (
    <div>
      <PageTitle
        sub={
          session.startedAt
            ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} left in this session`
            : "Five minutes: one question, one follow-up, one repaired answer."
        }
      >
        Coach
      </PageTitle>

      {replay && (
        <Card className="mb-4 border-sky-500/30 bg-sky-500/5">
          <Badge>Replay</Badge>
          <p className="mt-2 text-sm text-zinc-300">
            Replay mode: grades come from saved responses, not live model calls.{" "}
            {REPLAY_SOURCE === "authored"
              ? "These responses were written by hand in the model's output format; they have not been recorded from a live run."
              : "These responses were recorded from a live run."}{" "}
            The citation gate and combine step still run on them.
          </p>
          <Button size="sm" variant="ghost" className="mt-2 px-0" onClick={() => updateSettings({ replayMode: false })}>
            Turn replay off
          </Button>
        </Card>
      )}

      {session.phase === "role" && <RolePicker onPick={start} />}

      {round && topic && session.phase !== "role" && session.phase !== "done" && (
        <QuestionCard round={round} topic={topic} />
      )}

      {session.phase === "answering" && round && topic && (
        <AnswerBox
          key={`${round.topicId}-${session.rounds.length}`}
          topic={topic}
          initial={round.transcript}
          limit={state.settings.timerSeconds}
          replay={replay}
          onSubmit={grade}
        />
      )}

      {session.phase === "grading" && (
        <Card className="mb-4">
          <p className="text-sm text-zinc-300">
            Nano is pulling out your points; then Nano and Ultra rate each one in parallel.
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Same points, same rubric, same prompt. Every rating is checked against your words before
            the two are compared.
          </p>
        </Card>
      )}

      {session.phase === "results" && round?.outcome && topic && (
        <>
          <CoachResult
            topic={topic}
            outcome={round.outcome}
            trace={session.trace}
            closed={closed.filter((m) => byId.has(m.topicId))}
            topicTitle={(id) => byId.get(id)?.title ?? id}
            canSwitchToReplay={!replay && hasReplay(topic.id)}
            onSwitchToReplay={() => {
              updateSettings({ replayMode: true });
              dispatch({ type: "retry" });
            }}
          />
          <div className="mt-4 flex flex-wrap gap-3">
            {round.outcome.status !== "graded" && (
              <Button variant="primary" onClick={() => dispatch({ type: "retry" })}>
                Try again
              </Button>
            )}
            {round.outcome.status === "graded" && canAskFollowUp(session) && (
              <Button variant="primary" onClick={followUp}>
                Next: the follow-up
              </Button>
            )}
            {round.outcome.status === "graded" && !canAskFollowUp(session) && (
              <Button variant="primary" onClick={runRepair}>
                See the repaired answer
              </Button>
            )}
            <Button variant="ghost" onClick={reset}>
              End session
            </Button>
          </div>
        </>
      )}

      {session.phase === "repair" && (
        <>
          <RepairView repair={repair} />
          <div className="mt-4 flex gap-3">
            <Button variant="primary" onClick={() => dispatch({ type: "finish" })}>
              Finish
            </Button>
          </div>
        </>
      )}

      {session.phase === "done" && (
        <Card className="mb-4">
          <p className="text-sm text-zinc-200">Session complete.</p>
          <p className="mt-1 text-sm text-zinc-500">
            Any miss that is still open leads your next session.
          </p>
          <Button className="mt-3" onClick={reset}>
            Start another
          </Button>
        </Card>
      )}
    </div>
  );
}

/** The gap both models agreed on, which is what the repaired answer adds. */
function missedFor(round: Round): string[] {
  if (round.outcome?.status !== "graded" || !round.outcome.gap) return [];
  return [round.outcome.gap.rubricLine];
}

// --- pieces -----------------------------------------------------------------

function RolePicker({ onPick }: { onPick: (role: RoleTrack) => void }) {
  return (
    <Card className="mb-4">
      <SectionLabel>Pick your track</SectionLabel>
      <div className="flex flex-wrap gap-3">
        {(Object.keys(ROLE_LABELS) as RoleTrack[]).map((role) => (
          <Button key={role} variant="primary" onClick={() => onPick(role)}>
            {ROLE_LABELS[role]}
          </Button>
        ))}
      </div>
      <p className="mt-3 text-sm text-zinc-500">
        The interviewer picks a question from your open misses, or opens fresh if you have none.
      </p>
    </Card>
  );
}

export function QuestionCard({ round, topic }: { round: Round; topic: Topic }) {
  return (
    <Card className="mb-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge tone="accent">{round.kind === "opening" ? "Question" : "Follow-up"}</Badge>
        {topic.sourceLabel && <Badge>{SOURCE_LABELS[topic.sourceLabel]} source</Badge>}
        <span className="text-xs text-zinc-500">{topic.title}</span>
      </div>
      <p className="text-base text-zinc-100">{round.prompt}</p>
      {topic.sourceNote && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-zinc-500">Where this comes from</summary>
          <p className="mt-1 text-xs text-zinc-500">{topic.sourceNote}</p>
        </details>
      )}
    </Card>
  );
}

function AnswerBox({
  topic,
  initial,
  limit,
  replay,
  onSubmit,
}: {
  topic: Topic;
  initial: string;
  limit: number;
  replay: boolean;
  onSubmit: (transcript: string, seconds: number) => void;
}) {
  const [text, setText] = useState(initial);
  const [listening, setListening] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const live = useRef<LiveTranscript | null>(null);
  const saved = replayFor(topic.id);

  const stop = useCallback(() => {
    const final = live.current?.stop();
    live.current = null;
    setListening(false);
    if (final) setText(final);
  }, []);

  useEffect(() => {
    if (!listening) return;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [listening]);

  useEffect(() => {
    if (listening && elapsed >= limit) stop();
  }, [listening, elapsed, limit, stop]);

  useEffect(() => () => live.current?.discard(), []);

  const speak = () => {
    setError(null);
    setElapsed(0);
    live.current = startLiveTranscript({
      onUpdate: setText,
      onError: (e) => setError(`Speech recognition stopped (${e}). You can type or fix the text below.`),
    });
    if (live.current) setListening(true);
    else setError("Speech recognition is not available in this browser. Type your answer below.");
  };

  return (
    <Card className="mb-4">
      <SectionLabel>Your answer</SectionLabel>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {listening ? (
          <Button onClick={stop}>Stop ({limit - elapsed}s)</Button>
        ) : (
          <Button onClick={speak} disabled={!isTranscriptionSupported()}>
            Speak (up to {limit}s)
          </Button>
        )}
        {replay && saved && (
          <Button variant="ghost" onClick={() => setText(saved.transcript)}>
            Use the saved answer
          </Button>
        )}
      </div>
      {replay && !saved && (
        <p className="mb-2 text-xs text-amber-300">
          No saved answer exists for this question, so replay cannot grade it. Turn replay off to grade live.
        </p>
      )}
      {error && <p className="mb-2 text-xs text-rose-300">{error}</p>}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder="Your words appear here as you speak. Fix any mis-heard terms before grading."
        className="w-full resize-y rounded border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
      />
      <Button
        className="mt-3"
        variant="primary"
        disabled={listening || !text.trim()}
        onClick={() => onSubmit(text.trim(), elapsed)}
      >
        Grade this answer
      </Button>
    </Card>
  );
}

export function CoachResult({
  topic,
  outcome,
  trace,
  closed,
  topicTitle,
  canSwitchToReplay,
  onSwitchToReplay,
}: {
  topic: Topic;
  outcome: RatedOutcome;
  trace: TraceEntry[];
  closed: SpokenMiss[];
  topicTitle: (id: string) => string;
  canSwitchToReplay: boolean;
  onSwitchToReplay: () => void;
}) {
  if (outcome.status === "skipped") {
    return (
      <Card>
        <p className="text-sm text-zinc-300">There was nothing to grade, so no model was called.</p>
      </Card>
    );
  }

  if (outcome.status === "failed") {
    const quota = outcome.reason === "rate-limited" || outcome.reason === "quota-reached";
    return (
      <Card className="border-zinc-700">
        <p className="text-sm text-zinc-300">
          {quota ? "The shared demo budget is used up." : "The grade did not run."}
        </p>
        <p className="mt-1 text-sm text-zinc-500">{outcome.detail}</p>
        <p className="mt-2 text-sm text-zinc-500">
          No miss was invented. {quota && "Add your own Token Factory key in Settings, or "}
          {canSwitchToReplay ? "switch to replay to continue the demo with a saved answer." : ""}
        </p>
        {canSwitchToReplay && (
          <Button size="sm" className="mt-3" onClick={onSwitchToReplay}>
            Switch to replay
          </Button>
        )}
      </Card>
    );
  }

  const brief = buildCoachBrief(topic, outcome);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {outcome.replay && <Badge>Replay, not live</Badge>}
        {outcome.partial && (
          <Badge tone="bad">
            Only {outcome.models.nano ? "Nano" : "Ultra"} answered; one opinion per rating
          </Badge>
        )}
      </div>

      <Card>
        <SectionLabel>What you said</SectionLabel>
        <ul className="mt-3 space-y-4">
          {brief.groups.map((group) => (
            <li key={group.part}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={group.landed ? "good" : "bad"}>{group.landed ? "Landed" : "Not yet"}</Badge>
                <span className="text-sm text-zinc-200">{group.part}</span>
              </div>
              {group.highlights.length > 0 ? (
                <ul className="mt-2 space-y-2">
                  {group.highlights.map((quote) => (
                    <li key={quote}>
                      <SpokenQuote>{quote}</SpokenQuote>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-zinc-500">Nothing on-target yet for this part.</p>
              )}
            </li>
          ))}
        </ul>
        {brief.hasCollapsedNoise && (
          <p className="mt-4 text-xs text-zinc-500">The rest did not answer the question.</p>
        )}

        <div className="mt-6">
          <SectionLabel>Verdict</SectionLabel>
        </div>
        <p className="mt-2 text-sm text-zinc-100">{brief.verdict}</p>

        <div className="mt-6">
          <SectionLabel>Say this next</SectionLabel>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-emerald-100">{brief.sayNext}</p>

      </Card>

      <Analysis topic={topic} outcome={outcome} trace={trace} />
      {closed.length > 0 && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <SectionLabel>Closed on a different question</SectionLabel>
          {closed.map((m) => (
            <p key={m.id} className="text-sm text-zinc-200">
              &ldquo;{m.missType}&rdquo; from <span className="text-zinc-400">{topicTitle(m.topicId)}</span> is
              now closed: you covered it here without being asked the same question.
            </p>
          ))}
        </Card>
      )}
    </div>
  );
}

function RepairView({ repair }: { repair: RepairOutcome | null }) {
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
    <Card>
      <SectionLabel>Your answer, repaired</SectionLabel>
      <p className="mb-3 text-xs text-zinc-500">
        Your own sentences, plus only the missed points. Every added sentence is tagged with its rubric
        line; untagged additions were dropped{repair.repair.dropped > 0 ? ` (${repair.repair.dropped} here)` : ""}.
      </p>
      <div className="space-y-2">
        {repair.repair.sentences.map((s, i) =>
          s.rubricLine ? (
            <div key={i} className="rounded border border-emerald-500/30 bg-emerald-500/5 p-2">
              <p className="text-sm text-emerald-100">{s.text}</p>
              <p className="mt-1 text-[11px] text-zinc-500">Added for: {s.rubricLine}</p>
            </div>
          ) : (
            <p key={i} className="text-sm text-zinc-400">
              {s.text}
            </p>
          ),
        )}
      </div>
    </Card>
  );
}

