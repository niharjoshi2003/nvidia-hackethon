import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useStore } from "@/hooks/useStore";
import { findTopic } from "@/data/topics";
import { latestOpenMiss } from "@/lib/misses";
import { startRecording, isRecordingSupported, type Recorder } from "@/audio/recorder";
import {
  isTranscriptionSupported,
  startLiveTranscript,
  type LiveTranscript,
} from "@/audio/liveTranscript";
import { setPendingAttempt, clearPendingAttempt } from "@/audio/pendingAttempt";
import { Button, Empty } from "@/components/ui";

type Phase = "idle" | "countdown" | "running" | "paused";

const COUNTDOWN_SECONDS = 3;

export default function Explain() {
  const { topicId = "" } = useParams();
  const navigate = useNavigate();
  const { state } = useStore();
  const topic = findTopic(topicId, state.importedTopics);

  const limit = state.settings.timerSeconds;
  const [phase, setPhase] = useState<Phase>("idle");
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [elapsed, setElapsed] = useState(0);
  const [liveText, setLiveText] = useState("");
  const [micError, setMicError] = useState<string | null>(null);

  const recorderRef = useRef<Recorder | null>(null);
  const transcriptRef = useRef<LiveTranscript | null>(null);
  // Guards against finish() running twice, e.g. Enter pressed as the timer expires.
  const doneRef = useRef(false);

  const miss = topic ? latestOpenMiss(state.misses, topic.id) : undefined;

  const teardown = useCallback(() => {
    transcriptRef.current?.discard();
    transcriptRef.current = null;
    recorderRef.current?.discard();
    recorderRef.current = null;
  }, []);

  const abandon = useCallback(() => {
    doneRef.current = true;
    teardown();
    clearPendingAttempt();
    navigate("/");
  }, [navigate, teardown]);

  const finish = useCallback(
    async (seconds: number) => {
      if (doneRef.current || !topic) return;
      doneRef.current = true;

      const transcript = transcriptRef.current?.stop() ?? "";
      transcriptRef.current = null;
      const audio = (await recorderRef.current?.stop()) ?? null;
      recorderRef.current = null;

      setPendingAttempt({
        topicId: topic.id,
        spokenSeconds: seconds,
        transcript,
        audio,
        transcriptUnavailable: !transcript.trim(),
      });
      navigate(`/review/${topic.id}`);
    },
    [navigate, topic],
  );

  const begin = useCallback(async () => {
    setPhase("countdown");
    setCountdown(COUNTDOWN_SECONDS);

    // A microphone failure must not block the drill. The timer still runs and
    // the attempt still saves; only the grade is unavailable.
    try {
      if (isRecordingSupported()) {
        recorderRef.current = await startRecording();
      } else {
        setMicError("This browser cannot record audio. The timer still works.");
      }
    } catch {
      setMicError("The microphone is unavailable. The timer still works, but there is nothing to grade.");
    }

    if (isTranscriptionSupported()) {
      transcriptRef.current = startLiveTranscript({
        onUpdate: setLiveText,
        onError: () => setMicError("Speech recognition dropped out. You can fix the text on the next screen."),
      });
    } else {
      setMicError(
        "This browser cannot transcribe speech. Try Chrome or Edge, or type your answer on the next screen.",
      );
    }
  }, []);

  // Countdown, then the timer itself.
  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown <= 0) {
      setPhase("running");
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  useEffect(() => {
    if (phase !== "running") return;
    const t = setInterval(() => {
      setElapsed((e) => {
        const next = e + 1;
        if (next >= limit) void finish(limit);
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase, limit, finish]);

  // Keyboard is the whole interface here: nothing else is on screen.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        abandon();
        return;
      }
      if (event.key === " ") {
        event.preventDefault();
        if (phase === "idle") void begin();
        else if (phase === "running") setPhase("paused");
        else if (phase === "paused") setPhase("running");
        return;
      }
      if (event.key === "Enter" && (phase === "running" || phase === "paused")) {
        event.preventDefault();
        void finish(elapsed);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, elapsed, begin, finish, abandon]);

  // Releases the microphone if the screen unmounts any other way.
  useEffect(() => () => teardown(), [teardown]);

  if (!topic) return <Empty title="That topic is not in the library" />;

  const remaining = Math.max(0, limit - elapsed);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      {phase === "idle" ? (
        <div className="max-w-xl">
          <p className="text-xs uppercase tracking-wider text-zinc-500">Speak for {limit} seconds</p>
          <h1 className="mt-3 text-2xl font-semibold text-zinc-50">{topic.title}</h1>
          <p className="mt-3 text-sm text-zinc-400">{topic.framing}</p>

          {miss && (
            <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-left">
              <p className="text-xs uppercase tracking-wider text-amber-300/80">
                What you missed last time
              </p>
              <p className="mt-1.5 text-sm text-zinc-200">{miss.plainLanguage}</p>
            </div>
          )}

          <div className="mt-8 flex items-center justify-center gap-3">
            <Button variant="primary" onClick={() => void begin()}>
              Start
            </Button>
            <Button variant="ghost" onClick={abandon}>
              Back
            </Button>
          </div>
          <p className="mt-4 text-xs text-zinc-600">
            Space starts and pauses. Enter finishes early. Esc abandons and saves nothing.
          </p>
        </div>
      ) : phase === "countdown" ? (
        <p className="font-mono text-7xl tabular-nums text-zinc-100">{countdown || "go"}</p>
      ) : (
        <div className="w-full max-w-2xl">
          <p className="font-mono text-7xl tabular-nums text-zinc-100">
            {String(Math.floor(remaining / 60)).padStart(2, "0")}:
            {String(remaining % 60).padStart(2, "0")}
          </p>
          <p className="mt-2 text-xs uppercase tracking-wider text-zinc-500">
            {phase === "paused" ? "Paused" : "Recording"}
          </p>

          {liveText && (
            <p className="mt-8 max-h-40 overflow-y-auto text-left text-sm leading-relaxed text-zinc-500">
              {liveText}
            </p>
          )}

          <div className="mt-8 flex items-center justify-center gap-3">
            <Button onClick={() => setPhase(phase === "paused" ? "running" : "paused")}>
              {phase === "paused" ? "Resume" : "Pause"}
            </Button>
            <Button variant="primary" onClick={() => void finish(elapsed)}>
              Finish
            </Button>
            <Button variant="ghost" onClick={abandon}>
              Abandon
            </Button>
          </div>
        </div>
      )}

      {micError && <p className="mt-6 max-w-md text-xs text-rose-300/80">{micError}</p>}
    </div>
  );
}
