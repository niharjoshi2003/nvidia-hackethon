import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
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
  type QuestionChoice,
} from "@/agent/interviewer";
import { buildCoachBrief } from "@/lib/coachBrief";
import { buildSession, recordSession } from "@/lib/history";
import { latestOpenMiss, openMisses } from "@/lib/misses";
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
  SOURCE_LABELS,
  type RatedOutcome,
  type RoleTrack,
  type SpokenMiss,
  type Topic,
  type TraceEntry,
} from "@/types";
import { Badge, Button, Card, cx } from "@/components/ui";
import AnswerPanel from "@/components/AnswerPanel";
import GradedResult from "@/components/GradedResult";
import GradingPanel from "@/components/GradingPanel";
import Landing, { type InterviewOption } from "@/components/Landing";
import RepairView from "@/components/RepairView";
import ThreadSession from "@/components/ThreadSession";
import { ArrowRightIcon, CheckIcon } from "@/components/icons";
import { THREADS, threadFor } from "@/data/threads";
import { loadThread, type SavedThread } from "@/lib/threadStore";

/** The question the sample button opens. It has a saved answer, so no microphone is needed. */
const SAMPLE_TOPIC_ID = "rag-production-design";

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
  const { state, topics: allTopics, saveCoachRound, updateSettings } = useStore();
  const [params] = useSearchParams();
  const policy = params.get("failTools") === "1" ? failingPolicy : plannedPolicy;
  const replay = state.settings.replayMode;

  const topics = useMemo(() => coachTopics(), []);
  const byId = useMemo(() => new Map(allTopics.map((t) => [t.id, t])), [allTopics]);

  const [session, dispatch] = useReducer(sessionReducer, initialSession, loadSession);
  const [closed, setClosed] = useState<SpokenMiss[]>([]);
  const [repair, setRepair] = useState<RepairOutcome | null>(null);
  const [sample, setSample] = useState(false);
  // An interview thread, when the interviewer picks a topic that has one. The
  // classic single-question session below runs for every other topic.
  // A saved interview from before a refresh is picked up where it stopped.
  const [thread, setThread] = useState<{
    topicId: string;
    role: RoleTrack;
    reason: string;
    trace: TraceEntry[];
    startedAt: string;
    resume?: SavedThread | null;
  } | null>(() => {
    const saved = loadThread();
    return saved
      ? {
          topicId: saved.topicId,
          role: saved.role,
          reason: saved.reason,
          trace: saved.trace,
          startedAt: saved.startedAt,
          resume: saved,
        }
      : null;
  });
  const [now, setNow] = useState(() => new Date());

  useEffect(() => saveSession(session), [session]);

  // Keep the whole session in History as it grows: after each graded answer, and
  // again once the repaired answer arrives. Saving is idempotent per session.
  useEffect(() => {
    const record = buildSession({
      startedAt: session.startedAt,
      role: session.role,
      rounds: session.rounds,
      trace: session.trace,
      repair:
        repair?.status === "repaired"
          ? { sentences: repair.repair.sentences, dropped: repair.repair.dropped }
          : null,
      closed,
      titleFor: (topicId) => byId.get(topicId)?.title ?? topicId,
    });
    if (record) recordSession(record);
  }, [session, repair, closed, byId]);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const round = currentRound(session);
  const topic = round ? byId.get(round.topicId) : undefined;
  const openMiss = topic ? latestOpenMiss(state.misses, topic.id) : null;

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

  const start = async (role: RoleTrack, forcedTopicId?: string) => {
    const startedAt = new Date().toISOString();
    setClosed([]);
    setRepair(null);
    const agent = new Interviewer(policy);
    const ctx: InterviewContext = { role, topics, misses: state.misses, askedTopicIds: [] };
    const forced = forcedTopicId ? byId.get(forcedTopicId) : undefined;
    const choice: QuestionChoice = forced
      ? {
          topicId: forced.id,
          reason: "A sample question with a saved answer, so you can see a full result without a microphone.",
        }
      : await agent.pickNextQuestion(ctx);
    await agent.getRubric(choice.topicId, ctx);
    const picked = byId.get(choice.topicId);

    // The sample has a saved answer for the whole question, so it stays one question.
    if (!forced && picked && threadFor(picked.id)) {
      setThread({ topicId: picked.id, role, reason: choice.reason, trace: agent.trace, startedAt });
      return;
    }

    dispatch({ type: "start", role, at: startedAt });
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

  const startSample = async () => {
    updateSettings({ replayMode: true });
    setSample(true);
    await start("ai-engineer", SAMPLE_TOPIC_ID);
  };

  /** The visitor picked one interview from the list instead of letting the interviewer choose. */
  const chooseInterview = async (topicId: string) => {
    const picked = byId.get(topicId);
    if (!picked || !threadFor(topicId)) return;
    const role: RoleTrack = picked.roles?.[0] ?? "ai-engineer";
    const startedAt = new Date().toISOString();
    setSample(false);
    setClosed([]);
    setRepair(null);
    const agent = new Interviewer(policy);
    await agent.getRubric(topicId, { role, topics, misses: state.misses, askedTopicIds: [] });
    setThread({ topicId, role, reason: "You chose this interview.", trace: agent.trace, startedAt });
  };

  const interviews = useMemo<InterviewOption[]>(
    () =>
      THREADS.flatMap((def) => {
        const t = byId.get(def.topicId);
        if (!t) return [];
        return [
          {
            topicId: def.topicId,
            title: t.title,
            area: def.area,
            scene: def.scene,
            openGaps: state.misses.filter((m) => m.status === "open" && m.topicId === def.topicId).length,
          },
        ];
      }),
    [byId, state.misses],
  );

  const startLive = async (role: RoleTrack) => {
    setSample(false);
    await start(role);
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
    setThread(null);
    dispatch({ type: "reset" });
    setClosed([]);
    setRepair(null);
    setSample(false);
  };

  // --- render ---------------------------------------------------------------

  const left = remainingSeconds(session, now);
  const inSession = session.phase !== "role";
  const open = openMisses(state.misses);
  const closedCount = state.misses.filter((m) => m.status === "resolved").length;

  return (
    <div>
      {thread && threadFor(thread.topicId) && byId.get(thread.topicId) && (
        <ThreadSession
          key={thread.startedAt}
          topic={byId.get(thread.topicId)!}
          def={threadFor(thread.topicId)!}
          role={thread.role}
          startReason={thread.reason}
          trace={thread.trace}
          startedAt={thread.startedAt}
          resume={thread.resume}
          topicTitle={(id) => byId.get(id)?.title ?? id}
          onExit={reset}
        />
      )}

      {!thread && replay && (
        <Card className="mb-4 border-sky-500/30 bg-sky-500/5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <p className="text-sm text-zinc-300">
              <Badge>Replay</Badge>{" "}
              <span className="ml-1">
                Grades come from saved responses, not live model calls.{" "}
                {REPLAY_SOURCE === "authored"
                  ? "They were written by hand in the model's output format, not recorded live. "
                  : "They were recorded from a live run. "}
                The citation gate and combine step still run on them.
              </span>
            </p>
            <Button size="sm" variant="ghost" onClick={() => updateSettings({ replayMode: false })}>
              Turn replay off
            </Button>
          </div>
        </Card>
      )}

      {!thread && session.phase === "role" && (
        <Landing
          onPick={startLive}
          onChoose={chooseInterview}
          interviews={interviews}
          onSample={startSample}
          openMisses={open}
          closedCount={closedCount}
          topicTitle={(id) => byId.get(id)?.title ?? id}
        />
      )}

      {inSession && round && topic && session.phase !== "done" && (
        <div className="mb-4 flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <SessionStepper phase={session.phase} round={round} />
          </div>
          <p className="shrink-0 font-mono text-sm tabular-nums text-zinc-400" title="Time left in this session">
            {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
          </p>
        </div>
      )}

      {round && topic && inSession && session.phase !== "done" && (
        <QuestionCard
          round={round}
          topic={topic}
          // The gap being retested matters while answering. After grading, the
          // open miss may be the one this very answer just created.
          openMiss={session.phase === "answering" ? openMiss : null}
          compact={session.phase === "results" || session.phase === "repair"}
        />
      )}

      {session.phase === "answering" && round && topic && (
        <AnswerPanel
          key={`${round.topicId}-${session.rounds.length}`}
          topic={topic}
          initial={round.transcript || (sample ? (replayFor(topic.id)?.transcript ?? "") : "")}
          limit={state.settings.timerSeconds}
          replay={replay}
          onSubmit={grade}
        />
      )}

      {session.phase === "grading" && <GradingPanel />}

      {session.phase === "results" && round?.outcome && topic && (
        <>
          <CoachResult
            topic={topic}
            outcome={round.outcome}
            transcript={round.transcript}
            trace={session.trace}
            closed={closed.filter((m) => byId.has(m.topicId))}
            topicTitle={(id) => byId.get(id)?.title ?? id}
            canSwitchToReplay={!replay && hasReplay(topic.id)}
            onSwitchToReplay={() => {
              updateSettings({ replayMode: true });
              dispatch({ type: "retry" });
            }}
          />
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {round.outcome.status !== "graded" && (
              <Button variant="primary" size="lg" onClick={() => dispatch({ type: "retry" })}>
                Try again
              </Button>
            )}
            {round.outcome.status === "graded" && canAskFollowUp(session) && (
              <Button variant="primary" size="lg" onClick={followUp}>
                Next: a follow-up that targets your gap
                <ArrowRightIcon className="h-5 w-5" />
              </Button>
            )}
            {round.outcome.status === "graded" && !canAskFollowUp(session) && (
              <Button variant="primary" size="lg" onClick={runRepair}>
                See your repaired answer
                <ArrowRightIcon className="h-5 w-5" />
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
          <div className="mt-6 flex gap-3">
            <Button variant="primary" size="lg" onClick={() => dispatch({ type: "finish" })}>
              Finish
            </Button>
          </div>
        </>
      )}

      {session.phase === "done" && (
        <SessionSummary
          rounds={session.rounds}
          closed={closed}
          openCount={open.length}
          onRestart={reset}
        />
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

function SessionStepper({ phase, round }: { phase: string; round: Round }) {
  const current = phase === "repair" ? 3 : round.kind === "followup" ? 2 : 1;
  const steps = ["Question", "Follow-up", "Repair"];
  return (
    <ol className="flex items-center gap-2" aria-label="Session progress">
      {steps.map((label, index) => {
        const step = index + 1;
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={cx(
                "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                step < current
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                  : step === current
                    ? "border-amber-400 bg-amber-400 text-zinc-950"
                    : "border-zinc-700 text-zinc-500",
              )}
            >
              {step < current ? <CheckIcon className="h-3.5 w-3.5" /> : step}
            </span>
            <span className={cx("text-xs", step === current ? "text-zinc-200" : "text-zinc-500")}>{label}</span>
            {step < steps.length && <span className="h-px flex-1 bg-zinc-800" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

export function QuestionCard({
  round,
  topic,
  openMiss = null,
  compact = false,
}: {
  round: Round;
  topic: Topic;
  openMiss?: SpokenMiss | null;
  /** One quiet line, for when the result is the thing to read. */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <Card className="mb-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          {round.kind === "opening" ? "Question" : "Follow-up"} · {topic.title}
        </p>
        <p className="mt-1 line-clamp-2 text-sm text-zinc-300">{round.prompt}</p>
      </Card>
    );
  }
  return (
    <Card className="mb-4 animate-fade-up">
      {openMiss && (
        <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="text-xs font-medium uppercase tracking-wider text-amber-300">Open gap being retested</p>
          <p className="mt-1 text-sm text-zinc-200">{openMiss.plainLanguage}</p>
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone="accent">{round.kind === "opening" ? "Question" : "Follow-up"}</Badge>
        {topic.sourceLabel && <Badge>{SOURCE_LABELS[topic.sourceLabel]} source</Badge>}
        <span className="text-xs text-zinc-500">{topic.title}</span>
      </div>
      <p className="text-xl leading-relaxed text-zinc-50 sm:text-2xl">{round.prompt}</p>
      <p className="mt-3 text-sm text-zinc-400">
        <span className="font-medium text-zinc-300">Why this question:</span> {round.reason}
      </p>
      {topic.sourceNote && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-zinc-500">Where this comes from</summary>
          <p className="mt-1 text-xs text-zinc-500">{topic.sourceNote}</p>
        </details>
      )}
    </Card>
  );
}

export function CoachResult({
  topic,
  outcome,
  transcript = "",
  trace,
  closed,
  topicTitle,
  canSwitchToReplay,
  onSwitchToReplay,
  proofDefaultOpen = false,
}: {
  topic: Topic;
  outcome: RatedOutcome;
  transcript?: string;
  trace: TraceEntry[];
  closed: SpokenMiss[];
  topicTitle: (id: string) => string;
  canSwitchToReplay: boolean;
  onSwitchToReplay: () => void;
  proofDefaultOpen?: boolean;
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
        <p className="text-base font-medium text-zinc-100">
          {quota ? "The shared demo budget is used up." : "The grade did not run."}
        </p>
        <p className="mt-1 text-sm text-zinc-400">{outcome.detail}</p>
        <p className="mt-2 text-sm text-zinc-400">
          No miss was invented. {quota && "Add your own Token Factory key in Settings, or "}
          {canSwitchToReplay ? "switch to replay to continue the demo with a saved answer." : ""}
        </p>
        {canSwitchToReplay && (
          <Button size="sm" variant="primary" className="mt-3" onClick={onSwitchToReplay}>
            Switch to replay
          </Button>
        )}
      </Card>
    );
  }

  return (
    <GradedResult
      topic={topic}
      outcome={outcome}
      trace={trace}
      transcript={transcript}
      closed={closed}
      topicTitle={topicTitle}
      proofDefaultOpen={proofDefaultOpen}
    />
  );
}

function SessionSummary({
  rounds,
  closed,
  openCount,
  onRestart,
}: {
  rounds: Round[];
  closed: SpokenMiss[];
  openCount: number;
  onRestart: () => void;
}) {
  const answered = rounds.filter((r) => r.outcome?.status === "graded").length;
  const found = rounds.filter((r) => r.outcome?.status === "graded" && r.outcome.gap).length;
  const stats = [
    { label: "Answers rated", value: answered },
    { label: "Gaps found", value: found },
    { label: "Gaps closed", value: closed.length },
  ];
  return (
    <Card className="animate-fade-up p-6 text-center">
      <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
        <CheckIcon className="h-6 w-6" />
      </span>
      <h2 className="mt-3 text-2xl font-semibold text-zinc-50">Session complete</h2>
      <dl className="mx-auto mt-5 grid max-w-md grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
            <dd className="font-mono text-2xl font-semibold text-zinc-50">{s.value}</dd>
            <dt className="mt-0.5 text-xs text-zinc-500">{s.label}</dt>
          </div>
        ))}
      </dl>
      <p className="mx-auto mt-5 max-w-md text-sm text-zinc-400">
        {openCount > 0
          ? `${openCount} gap${openCount === 1 ? " is" : "s are"} still open. Your next session starts from ${openCount === 1 ? "it" : "them"}.`
          : "No open gaps. Your next session starts with a fresh question."}
      </p>
      <Button className="mt-5" variant="primary" size="lg" onClick={onRestart}>
        Start another session
      </Button>
    </Card>
  );
}