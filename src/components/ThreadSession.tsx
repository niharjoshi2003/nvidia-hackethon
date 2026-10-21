import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { rateAnswer } from "@/agent/rateAnswer";
import { repairAnswer, type RepairOutcome } from "@/agent/repairAnswer";
import {
  isSpeechSynthesisSupported,
  loadVoicePreference,
  saveVoicePreference,
  silence,
  speak,
} from "@/audio/speak";
import { TURN_LABELS, type ThreadDef } from "@/data/threads";
import { useStore } from "@/hooks/useStore";
import { buildSession, recordSession } from "@/lib/history";
import {
  MAX_TURNS,
  buildScorecard,
  openingTurn,
  planNextTurn,
  turnTopic,
  viewOfTurn,
  type PlannedTurn,
  type ScoredTurn,
  type TurnRecord,
} from "@/lib/thread";
import { clearThread, saveThread, type SavedThread } from "@/lib/threadStore";
import {
  eventFromScorecard,
  getVisitorId,
  sendInterview,
  setTelemetryEnabled,
  telemetryEnabled,
} from "@/lib/telemetry";
import { BAND_LABELS, type GradedOutcome } from "@/lib/analysis";
import type { RatedOutcome, RoleTrack, SpokenMiss, Topic, TraceEntry } from "@/types";
import AnnotatedTranscript from "./AnnotatedTranscript";
import AnswerPanel from "./AnswerPanel";
import GradedResult from "./GradedResult";
import { ArrowRightIcon, CheckIcon, MicIcon } from "./icons";
import RepairView from "./RepairView";
import ThreadScorecard from "./ThreadScorecard";
import { Badge, Button, Card, SectionLabel, cx } from "./ui";

type Phase = "intro" | "asking" | "planning" | "finishing" | "scorecard";

interface Props {
  topic: Topic;
  def: ThreadDef;
  role: RoleTrack;
  /** Why the interviewer chose this topic, from the agent's pick. */
  startReason: string;
  trace: TraceEntry[];
  startedAt: string;
  /** An interview found in this browser, to carry on from where it stopped. */
  resume?: SavedThread | null;
  topicTitle: (id: string) => string;
  onExit: () => void;
}

/** Where a saved interview picks up: the question that was on screen, or the next one, or the scorecard. */
function restoreState(
  resume: SavedThread | null | undefined,
  def: ThreadDef,
  topic: Topic,
): { phase: Phase; current: PlannedTurn | null } {
  if (!resume) return { phase: "intro", current: null };
  if (resume.turns.length >= MAX_TURNS) return { phase: "scorecard", current: null };
  const answered = new Set(resume.turns.map((t) => t.turn.id));
  const current =
    resume.current && !answered.has(resume.current.id)
      ? resume.current
      : resume.turns.length === 0
        ? openingTurn(def, topic)
        : planNextTurn(
            def,
            topic,
            resume.turns.map((t) => ({ turn: t.turn, outcome: t.outcome })),
          );
  return current ? { phase: "asking", current } : { phase: "scorecard", current: null };
}

/** How long the next question waits for an earlier turn's rating before going ahead without it. */
const PLANNING_WAIT_MS = 20_000;

const failed = (error: unknown): RatedOutcome => ({
  status: "failed",
  reason: "grade-error",
  detail: error instanceof Error ? error.message : String(error),
  calls: [],
});

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The interview thread: five short, spoken turns on one topic.
 *
 * The interviewer reads each question aloud and the microphone starts when it
 * finishes. Nothing is shown about how an answer went until the end. Each answer
 * is rated in the background while the next question is asked, and the next
 * question is chosen from whatever has been rated by then.
 */
export default function ThreadSession({
  topic,
  def,
  role,
  startReason,
  trace,
  startedAt,
  resume,
  topicTitle,
  onExit,
}: Props) {
  const { state, saveThreadResult } = useStore();
  const ownApiKey = state.settings.ownApiKey || undefined;

  const [start] = useState(() => restoreState(resume, def, topic));
  const [phase, setPhase] = useState<Phase>(start.phase);
  const [turns, setTurns] = useState<TurnRecord[]>(resume?.turns ?? []);
  const [current, setCurrent] = useState<PlannedTurn | null>(start.current);
  const [voice, setVoice] = useState(loadVoicePreference);
  const [counting, setCounting] = useState(telemetryEnabled);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState<{ miss: SpokenMiss | null; closed: SpokenMiss[] } | null>(resume?.saved ?? null);
  const [isCommitted, setIsCommitted] = useState(resume?.committed ?? false);
  const [saveAnyway, setSaveAnyway] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [repair, setRepair] = useState<RepairOutcome | null | undefined>(undefined);

  const turnsRef = useRef<TurnRecord[]>(resume?.turns ?? []);
  const jobs = useRef(new Map<number, Promise<RatedOutcome>>());
  const alive = useRef(true);
  const committed = useRef(resume?.committed ?? false);

  const speechOk = isSpeechSynthesisSupported();
  const talking = voice && speechOk;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      silence();
    };
  }, []);

  const mutate = useCallback((fn: (list: TurnRecord[]) => TurnRecord[]) => {
    turnsRef.current = fn(turnsRef.current);
    if (alive.current) setTurns(turnsRef.current);
  }, []);

  // --- the interviewer's voice ------------------------------------------------

  useEffect(() => {
    if (phase !== "asking" || !current) return;
    if (!talking) {
      setReady(true);
      return;
    }
    setReady(false);
    const speaking = speak(current.prompt, () => setReady(true));
    return () => speaking.cancel();
  }, [phase, current, talking]);

  const toggleCounting = () => {
    const next = !counting;
    setCounting(next);
    setTelemetryEnabled(next);
  };

  const toggleVoice = () => {
    const next = !voice;
    setVoice(next);
    saveVoicePreference(next);
    if (!next) {
      silence();
      setReady(true);
    }
  };

  // --- rating in the background --------------------------------------------------

  const rate = useCallback(
    async (index: number, turn: PlannedTurn, transcript: string): Promise<RatedOutcome> => {
      const attempt = () => rateAnswer({ topic: turnTopic(topic, turn), transcript, ownApiKey }).catch(failed);
      let outcome = await attempt();
      // A dropped connection to the model host is usually gone a moment later. Budget
      // and rate-limit refusals are not, so those are never retried.
      if (outcome.status === "failed" && outcome.reason !== "rate-limited" && outcome.reason !== "quota-reached") {
        await wait(1500);
        outcome = await attempt();
      }
      mutate((list) => list.map((t, i) => (i === index ? { ...t, outcome } : t)));
      return outcome;
    },
    [topic, ownApiKey, mutate],
  );

  // A turn that was still being rated when the page closed has no result and no job
  // running. Rate it again so a refresh never leaves an answer waiting forever.
  useEffect(() => {
    turnsRef.current.forEach((t, i) => {
      if (t.outcome === null && !jobs.current.has(i)) jobs.current.set(i, rate(i, t.turn, t.transcript));
    });
  }, [rate]);

  // Keep the interview in this browser as it grows, so a refresh resumes it.
  useEffect(() => {
    if (phase === "intro") return;
    saveThread({
      startedAt,
      topicId: topic.id,
      role,
      reason: startReason,
      trace,
      turns,
      current: phase === "asking" ? current : null,
      committed: isCommitted,
      saved,
    });
  }, [phase, startedAt, topic.id, role, startReason, trace, turns, current, isCommitted, saved]);

  const leave = () => {
    clearThread();
    onExit();
  };

  const end = () => {
    const midway = turns.length > 0 && phase !== "scorecard";
    if (midway && !window.confirm("End the interview now? You will not be able to resume it.")) return;
    silence();
    leave();
  };

  const asked = () => turnsRef.current.map((t) => ({ turn: t.turn, outcome: t.outcome }));

  const finish = useCallback(async () => {
    setPhase("finishing");
    await Promise.all([...jobs.current.values()]);
    if (alive.current) setPhase("scorecard");
  }, []);

  const begin = () => {
    setCurrent(openingTurn(def, topic));
    setPhase("asking");
  };

  const submit = async (transcript: string, spokenSeconds: number) => {
    if (!current) return;
    const index = turnsRef.current.length;
    mutate((list) => [...list, { turn: current, transcript, spokenSeconds, outcome: null, at: new Date().toISOString() }]);
    jobs.current.set(index, rate(index, current, transcript));

    if (index + 1 >= MAX_TURNS) {
      await finish();
      return;
    }

    setPhase("planning");
    // Plan from the turn before this one, which has had a whole answer's time to come back.
    const earlier = jobs.current.get(index - 1);
    if (earlier) await Promise.race([earlier, wait(PLANNING_WAIT_MS)]);
    if (!alive.current) return;

    const next = planNextTurn(def, topic, asked());
    if (!next) {
      await finish();
      return;
    }
    setCurrent(next);
    setPhase("asking");
  };

  // --- what the interview adds up to ----------------------------------------------

  const scored: ScoredTurn[] = useMemo(() => turns.map((t) => ({ turn: t.turn, outcome: t.outcome })), [turns]);
  const unrated = turns.filter((t) => t.outcome?.status === "failed");
  const settled = turns.length > 0 && turns.every((t) => t.outcome !== null);

  // Memory is written once, after every turn has an answer from the models. If a
  // turn failed, the candidate chooses: retry it, or save without it.
  useEffect(() => {
    if (phase !== "scorecard" || committed.current || !settled) return;
    if (unrated.length > 0 && !saveAnyway) return;
    committed.current = true;
    setIsCommitted(true);

    const card = buildScorecard(topic, scored);
    if (card.rated === 0) return;

    // The anonymous usage count: scores and counts only, never a word of the answers.
    // It runs only if the visitor left counting on, and it cannot fail the interview.
    const event = eventFromScorecard({ topicId: topic.id, startedAt, visitorId: getVisitorId(), card });
    if (event) void sendInterview(event);

    const source = card.gapTurn === null ? null : turns[card.gapTurn]?.outcome;
    const gradedSource = source?.status === "graded" ? source : null;
    setSaved(
      saveThreadResult({
        topic,
        turns: turns.map((t) => ({ transcript: t.transcript, spokenSeconds: t.spokenSeconds })),
        gap: card.gap,
        models: { nano: gradedSource?.models.nano ?? null, ultra: gradedSource?.models.ultra ?? null },
        supported: card.supported,
      }),
    );
  }, [phase, settled, unrated.length, saveAnyway, scored, topic, turns, startedAt, saveThreadResult]);

  const retryUnrated = async () => {
    setRetrying(true);
    const indexes = turns.flatMap((t, i) => (t.outcome?.status === "failed" ? [i] : []));
    mutate((list) => list.map((t, i) => (indexes.includes(i) ? { ...t, outcome: null } : t)));
    await Promise.all(indexes.map((i) => rate(i, turnsRef.current[i]!.turn, turnsRef.current[i]!.transcript)));
    if (alive.current) setRetrying(false);
  };

  const card = useMemo(() => buildScorecard(topic, scored), [topic, scored]);

  const runRepair = async () => {
    if (!card.gap) return;
    setRepair(null);
    const said = turns
      .map((t) => t.transcript)
      .join(" ")
      .slice(0, 6000);
    const result = await repairAnswer({ transcript: said, missedLines: [card.gap.rubricLine], ownApiKey });
    if (alive.current) setRepair(result);
  };

  // --- keep the whole interview in History as it grows ------------------------------

  useEffect(() => {
    if (turns.length === 0) return;
    const record = buildSession({
      startedAt,
      role,
      mode: "thread",
      rounds: turns.map((t) => ({
        topicId: topic.id,
        kind: t.turn.kind,
        prompt: t.turn.prompt,
        reason: t.turn.reason,
        transcript: t.transcript,
        spokenSeconds: t.spokenSeconds,
        outcome: t.outcome,
        view: viewOfTurn(topic, t.turn),
      })),
      trace: [
        ...trace,
        ...turns.map((t, i) => ({
          at: t.at,
          tool: i === 0 ? ("getRubric" as const) : ("pickFollowUp" as const),
          ok: true,
          fallback: false,
          reason: `Turn ${i + 1}: ${t.turn.reason}`,
        })),
      ],
      repair:
        repair?.status === "repaired"
          ? { sentences: repair.repair.sentences, dropped: repair.repair.dropped }
          : null,
      closed: (saved?.closed ?? []).map((m) => ({ missType: m.missType, topicId: m.topicId })),
      titleFor: (id) => (id === topic.id ? topic.title : topicTitle(id)),
    });
    if (record) recordSession(record);
  }, [turns, repair, saved, startedAt, role, topic, trace, topicTitle]);

  // --- render --------------------------------------------------------------------------

  if (phase === "intro") {
    return (
      <div className="animate-fade-up">
        <Card className="p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">Interview</Badge>
            <span className="text-xs text-zinc-500">{topic.title}</span>
          </div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-50">Five short questions, one topic.</h2>
          <p className="mt-3 max-w-2xl text-lg leading-relaxed text-zinc-200">{def.scene}</p>

          <dl className="mt-5 grid max-w-xl grid-cols-3 gap-3">
            {[
              ["5", "short turns"],
              ["~5 min", "30 to 60 seconds each"],
              ["At the end", "no feedback mid-interview"],
            ].map(([value, label]) => (
              <div key={label} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                <dd className="text-lg font-semibold text-zinc-50">{value}</dd>
                <dt className="mt-0.5 text-xs text-zinc-500">{label}</dt>
              </div>
            ))}
          </dl>

          <p className="mt-5 max-w-2xl text-sm text-zinc-400">
            <span className="font-medium text-zinc-300">Why this topic:</span> {startReason}
          </p>
          <p className="mt-2 max-w-2xl text-sm text-zinc-500">
            Each answer is rated in the background while you answer the next question. The questions after the second
            adapt to what the models have rated so far.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button variant="primary" size="lg" onClick={begin}>
              Begin the interview
              <ArrowRightIcon className="h-5 w-5" />
            </Button>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={voice} onChange={toggleVoice} disabled={!speechOk} className="h-4 w-4 accent-amber-400" />
              Read questions aloud
              {!speechOk && <span className="text-xs text-zinc-500">(not available in this browser)</span>}
            </label>
            <Button variant="ghost" onClick={leave}>
              Back
            </Button>
          </div>
          <label className="mt-4 flex max-w-2xl cursor-pointer items-start gap-2 text-xs leading-relaxed text-zinc-400">
            <input
              type="checkbox"
              checked={counting}
              onChange={toggleCounting}
              className="mt-0.5 h-4 w-4 shrink-0 accent-amber-400"
            />
            <span>
              Add this interview to the public tally. Only the topic, your scores and counts are sent, as a random id.
              Never your words or your voice.
            </span>
          </label>
        </Card>
      </div>
    );
  }

  return (
    <div>
      {phase !== "scorecard" && (
        <Progress
          turns={turns}
          currentIndex={phase === "asking" ? turns.length : -1}
          voice={voice}
          speechOk={speechOk}
          onVoice={toggleVoice}
          onEnd={end}
        />
      )}

      {phase === "asking" && current && (
        <>
          <Card className="mb-4 animate-fade-up">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone="accent">{TURN_LABELS[current.kind]}</Badge>
              <Badge>about {current.seconds}s</Badge>
              <span className="text-xs text-zinc-500">
                Question {turns.length + 1} of {MAX_TURNS}
              </span>
            </div>
            <p className="text-xl leading-relaxed text-zinc-50 sm:text-2xl">{current.prompt}</p>

            {talking && !ready && (
              <div className="mt-4 flex items-center gap-3" role="status">
                <Equaliser />
                <span className="text-sm text-zinc-400">The interviewer is speaking. The microphone starts after.</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    silence();
                    setReady(true);
                  }}
                >
                  Skip
                </Button>
              </div>
            )}

            <p className="mt-3 text-sm text-zinc-400">
              <span className="font-medium text-zinc-300">Why this question:</span> {current.reason}
            </p>
          </Card>

          {ready ? (
            <AnswerPanel
              key={current.id}
              topic={turnTopic(topic, current)}
              initial=""
              limit={current.seconds}
              replay={false}
              onSubmit={submit}
              autoStart={talking}
              submitLabel={turns.length + 1 >= MAX_TURNS ? "Send last answer" : "Send answer"}
              hint="Tap the microphone and answer out loud."
              rows={4}
            />
          ) : (
            <Card className="mb-4 flex items-center gap-3 border-dashed text-zinc-500">
              <MicIcon className="h-5 w-5" />
              <p className="text-sm">Listen to the question first.</p>
            </Card>
          )}
        </>
      )}

      {phase === "planning" && (
        <Card className="mb-4 animate-fade-up" role="status" aria-live="polite">
          <p className="shimmer-text text-lg font-semibold">Choosing your next question…</p>
          <p className="mt-1 text-sm text-zinc-400">
            It is picked from what the models have rated so far. Your earlier answers are being rated in the
            background, and nothing is shown until the end.
          </p>
        </Card>
      )}

      {phase === "finishing" && <Finishing turns={turns} />}

      {phase === "scorecard" && (
        <Scorecard
          topic={topic}
          turns={turns}
          scored={scored}
          saved={saved}
          unrated={unrated.length}
          retrying={retrying}
          onRetry={retryUnrated}
          onSaveAnyway={() => setSaveAnyway(true)}
          committed={isCommitted}
          gapRubric={card.gap?.rubricLine ?? null}
          repair={repair}
          onRepair={runRepair}
          topicTitle={topicTitle}
          onExit={leave}
        />
      )}
    </div>
  );
}

// --- pieces ---------------------------------------------------------------------------------

function Equaliser() {
  return (
    <span className="flex h-5 items-end gap-0.5" aria-hidden>
      {[0, 150, 300, 450].map((delay) => (
        <span
          key={delay}
          className="w-1 animate-pulse rounded-full bg-nv"
          style={{ height: `${40 + ((delay / 150) % 3) * 25}%`, animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

function Progress({
  turns,
  currentIndex,
  voice,
  speechOk,
  onVoice,
  onEnd,
}: {
  turns: TurnRecord[];
  currentIndex: number;
  voice: boolean;
  speechOk: boolean;
  onVoice: () => void;
  onEnd: () => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      <ol className="flex flex-1 items-center gap-2" aria-label="Interview progress">
        {Array.from({ length: MAX_TURNS }, (_, i) => {
          const done = i < turns.length;
          const outcome = turns[i]?.outcome;
          const status = !done ? null : outcome === null ? "rating" : outcome?.status === "failed" ? "failed" : "rated";
          return (
            <li key={i} className="flex flex-1 items-center gap-2">
              <span
                title={done ? `Answered. ${status === "rating" ? "Being rated in the background." : ""}` : undefined}
                className={cx(
                  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  done && status === "failed" && "border-rose-500/50 bg-rose-500/10 text-rose-300",
                  done && status !== "failed" && "border-emerald-500/50 bg-emerald-500/10 text-emerald-300",
                  !done && i === currentIndex && "border-amber-400 bg-amber-400 text-zinc-950",
                  !done && i !== currentIndex && "border-zinc-700 text-zinc-500",
                )}
              >
                {done ? status === "rating" ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" /> : <CheckIcon className="h-3.5 w-3.5" /> : i + 1}
              </span>
              {i < MAX_TURNS - 1 && <span className="h-px flex-1 bg-zinc-800" aria-hidden />}
            </li>
          );
        })}
      </ol>
      <div className="flex items-center gap-1">
        {speechOk && (
          <Button size="sm" variant="ghost" onClick={onVoice} aria-pressed={voice}>
            Voice {voice ? "on" : "off"}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onEnd}>
          End
        </Button>
      </div>
    </div>
  );
}

function Finishing({ turns }: { turns: TurnRecord[] }) {
  return (
    <Card className="mb-4 animate-fade-up" role="status" aria-live="polite">
      <p className="shimmer-text text-lg font-semibold">Finishing the ratings…</p>
      <p className="mt-1 text-sm text-zinc-400">Two Nemotron models are rating your last answers. Then you get the scorecard.</p>
      <ul className="mt-4 space-y-2">
        {turns.map((t, i) => (
          <li key={i} className="flex items-center gap-3 text-sm">
            <span
              className={cx(
                "inline-flex h-5 w-5 items-center justify-center rounded-full border",
                t.outcome === null ? "border-amber-400/60" : "border-emerald-500/50 bg-emerald-500/10 text-emerald-300",
              )}
            >
              {t.outcome === null ? (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              ) : (
                <CheckIcon className="h-3 w-3" />
              )}
            </span>
            <span className={t.outcome === null ? "text-zinc-300" : "text-zinc-500"}>
              {i + 1}. {TURN_LABELS[t.turn.kind]}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Scorecard({
  topic,
  turns,
  scored,
  saved,
  unrated,
  retrying,
  onRetry,
  onSaveAnyway,
  committed,
  gapRubric,
  repair,
  onRepair,
  topicTitle,
  onExit,
}: {
  topic: Topic;
  turns: TurnRecord[];
  scored: ScoredTurn[];
  saved: { miss: SpokenMiss | null; closed: SpokenMiss[] } | null;
  unrated: number;
  retrying: boolean;
  onRetry: () => void;
  onSaveAnyway: () => void;
  committed: boolean;
  gapRubric: string | null;
  repair: RepairOutcome | null | undefined;
  onRepair: () => void;
  topicTitle: (id: string) => string;
  onExit: () => void;
}) {
  const firstFailure = turns.find((t) => t.outcome?.status === "failed")?.outcome;
  const quota =
    firstFailure?.status === "failed" && (firstFailure.reason === "rate-limited" || firstFailure.reason === "quota-reached");

  return (
    <div className="space-y-4">
      {unrated > 0 && !committed && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <p className="text-sm font-medium text-amber-200">
            {unrated} turn{unrated === 1 ? "" : "s"} could not be rated.
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            {quota
              ? "The shared demo budget is used up. Add your own Token Factory key in Settings, then retry."
              : firstFailure?.status === "failed"
                ? firstFailure.detail
                : ""}{" "}
            Nothing is written to your miss log until you retry or save without {unrated === 1 ? "it" : "them"}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={onRetry} disabled={retrying}>
              {retrying ? "Retrying…" : `Retry ${unrated === 1 ? "that turn" : "those turns"}`}
            </Button>
            <Button size="sm" variant="secondary" onClick={onSaveAnyway} disabled={retrying}>
              Save without {unrated === 1 ? "it" : "them"}
            </Button>
          </div>
        </Card>
      )}

      <ThreadScorecard topic={topic} turns={scored}>
        <Card className="animate-fade-up">
          <SectionLabel>What the coach remembers</SectionLabel>
          {!committed ? (
            <p className="text-sm text-zinc-400">Waiting for every turn to be rated before anything is saved.</p>
          ) : (
            <div className="space-y-2 text-sm">
              {saved?.miss ? (
                <p className="text-zinc-200">
                  Added to your miss log: <span className="text-amber-200">&ldquo;{saved.miss.missType}&rdquo;</span>. Your
                  next interview starts from it, on a different question, and it only closes when you cover it there.
                </p>
              ) : (
                <p className="text-zinc-400">No gap was added to your miss log from this interview.</p>
              )}
              {(saved?.closed ?? []).map((m) => (
                <p key={m.id} className="text-emerald-200">
                  Closed: &ldquo;{m.missType}&rdquo; from{" "}
                  <span className="text-emerald-100/80">{topicTitle(m.topicId)}</span>, because you covered it here.
                </p>
              ))}
            </div>
          )}
        </Card>
      </ThreadScorecard>

      {/* Per turn */}
      <div>
        <SectionLabel>Turn by turn</SectionLabel>
        <div className="space-y-2">
          {turns.map((t, i) => (
            <TurnDetail key={i} index={i} topic={topic} record={t} topicTitle={topicTitle} />
          ))}
        </div>
      </div>

      {/* Repair */}
      {gapRubric && (
        <div>
          {repair === undefined && (
            <Card className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-xl text-sm text-zinc-300">
                Turn the whole interview into one answer: your own sentences from every turn, plus only the one idea
                you missed.
              </p>
              <Button variant="secondary" onClick={onRepair}>
                Build my repaired answer
              </Button>
            </Card>
          )}
          {repair === null && (
            <Card role="status">
              <p className="shimmer-text text-sm font-semibold">Building your repaired answer…</p>
            </Card>
          )}
          {repair && <RepairView repair={repair} />}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button variant="primary" size="lg" onClick={onExit}>
          Start another interview
          <ArrowRightIcon className="h-5 w-5" />
        </Button>
        <Link to="/history" className="text-sm text-zinc-400 underline-offset-4 hover:text-zinc-100 hover:underline">
          See it in History
        </Link>
      </div>
    </div>
  );
}

function TurnDetail({
  index,
  topic,
  record,
  topicTitle,
}: {
  index: number;
  topic: Topic;
  record: TurnRecord;
  topicTitle: (id: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const outcome = record.outcome?.status === "graded" ? (record.outcome as GradedOutcome) : null;
  const view = useMemo(() => turnTopic(topic, record.turn), [topic, record.turn]);
  const band = useMemo(() => (outcome ? buildScorecard(topic, [{ turn: record.turn, outcome }]).overall.band : null), [outcome, topic, record.turn]);

  return (
    <Card className="p-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-zinc-700 text-xs font-semibold text-zinc-400">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <Badge>{TURN_LABELS[record.turn.kind]}</Badge>
            {band && <Badge tone={band === "strong" || band === "solid" ? "good" : "accent"}>{BAND_LABELS[band]}</Badge>}
            {!outcome && <Badge tone="bad">Not rated</Badge>}
          </span>
          <span className="mt-1.5 line-clamp-2 block text-sm text-zinc-200">{record.turn.prompt}</span>
        </span>
        <span className="mt-1 text-xs text-zinc-500">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-zinc-800 p-4">
          <p className="text-sm text-zinc-500">
            <span className="font-medium text-zinc-400">Why this question:</span> {record.turn.reason}
          </p>
          {outcome ? (
            <>
              <AnnotatedTranscript transcript={record.transcript} points={outcome.points} />
              <GradedResult
                topic={view}
                outcome={outcome}
                trace={[]}
                transcript={record.transcript}
                closed={[]}
                topicTitle={topicTitle}
                hideTranscript
              />
            </>
          ) : (
            <p className="text-sm italic text-zinc-300">&ldquo;{record.transcript}&rdquo;</p>
          )}
        </div>
      )}
    </Card>
  );
}
