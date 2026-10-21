import { useCallback, useEffect, useRef, useState } from "react";
import { replayFor } from "@/agent/replay";
import { isTranscriptionSupported, startLiveTranscript, type LiveTranscript } from "@/audio/liveTranscript";
import { wordCount } from "@/lib/text";
import type { Topic } from "@/types";
import { ArrowRightIcon, MicIcon, StopIcon } from "./icons";
import { Button, Card, cx } from "./ui";

interface AnswerPanelProps {
  topic: Topic;
  initial: string;
  limit: number;
  replay: boolean;
  onSubmit: (transcript: string, seconds: number) => void;
  /** Start listening as soon as the panel appears, for turns that follow a spoken question. */
  autoStart?: boolean;
  submitLabel?: string;
  /** Replaces the idle line under the timer. */
  hint?: string;
  /** A smaller text box, for short turns. */
  rows?: number;
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

const RING_RADIUS = 62;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** The timed minute: one big microphone, a ring that drains, and the words as they arrive. */
export default function AnswerPanel({
  topic,
  initial,
  limit,
  replay,
  onSubmit,
  autoStart = false,
  submitLabel = "Rate my answer",
  hint,
  rows = 6,
}: AnswerPanelProps) {
  const [text, setText] = useState(initial);
  const [listening, setListening] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const live = useRef<LiveTranscript | null>(null);
  const saved = replayFor(topic.id);
  const supported = isTranscriptionSupported();

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

  const speak = useCallback(() => {
    setError(null);
    setElapsed(0);
    live.current = startLiveTranscript({
      onUpdate: setText,
      onError: (e) => setError(`Speech recognition stopped (${e}). You can type or fix the text below.`),
    });
    if (live.current) setListening(true);
    else setError("Speech recognition is not available in this browser. Type your answer below.");
  }, []);

  // A turn that follows a spoken question starts listening by itself. The cleanup
  // lets React's dev double-mount start it again instead of leaving it dead.
  useEffect(() => {
    if (!autoStart || !supported) return;
    speak();
    return () => {
      live.current?.discard();
      live.current = null;
      setListening(false);
    };
  }, [autoStart, supported, speak]);

  const remaining = Math.max(0, limit - elapsed);
  const progress = listening ? Math.min(1, elapsed / limit) : 0;
  const words = wordCount(text);
  const lowTime = listening && remaining <= 10;

  return (
    <Card className="mb-4 animate-fade-up">
      <div className="flex flex-col items-center pt-2 text-center">
        <div className="relative h-36 w-36">
          {listening && (
            <span
              className="animate-pulse-ring absolute inset-4 rounded-full bg-rose-500/40"
              aria-hidden
            />
          )}
          <svg viewBox="0 0 144 144" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="72" cy="72" r={RING_RADIUS} fill="none" strokeWidth="5" className="stroke-zinc-800" />
            <circle
              cx="72"
              cy="72"
              r={RING_RADIUS}
              fill="none"
              strokeWidth="5"
              strokeLinecap="round"
              className={cx("transition-[stroke-dashoffset] duration-1000 ease-linear", lowTime ? "stroke-rose-400" : "stroke-amber-400")}
              strokeDasharray={RING_LENGTH}
              strokeDashoffset={RING_LENGTH * (1 - progress)}
            />
          </svg>
          <button
            type="button"
            onClick={listening ? stop : speak}
            disabled={!listening && !supported}
            aria-label={listening ? "Stop recording" : `Start recording, up to ${limit} seconds`}
            className={cx(
              "absolute inset-[22px] flex items-center justify-center rounded-full text-zinc-950 shadow-lg transition-transform",
              "hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100",
              listening ? "bg-rose-400" : "bg-amber-400",
            )}
          >
            {listening ? <StopIcon className="h-8 w-8" /> : <MicIcon className="h-9 w-9" />}
          </button>
        </div>

        <p className="mt-3 font-mono text-3xl font-semibold tabular-nums text-zinc-50" aria-live="off">
          {clock(listening ? remaining : limit)}
        </p>
        <p className="mt-1 text-sm text-zinc-400" role="status">
          {listening
            ? "Listening. Tap to finish early."
            : hint
              ? hint
              : supported
              ? "Tap the microphone and answer out loud."
              : "This browser has no speech recognition. Use Chrome or Edge, or type below."}
        </p>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <label htmlFor="answer-text" className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Your answer
          </label>
          <span className="flex items-center gap-2 text-xs text-zinc-500">
            {listening && (
              <span className="inline-flex items-center gap-1.5 text-rose-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" aria-hidden />
                live
              </span>
            )}
            {words} word{words === 1 ? "" : "s"}
          </span>
        </div>
        <textarea
          id="answer-text"
          value={text}
          readOnly={listening}
          onChange={(e) => setText(e.target.value)}
          rows={rows}
          placeholder="Your words appear here as you speak. After you stop, fix any mis-heard terms before grading."
          className={cx(
            "w-full resize-y rounded-lg border bg-zinc-950 p-4 text-base leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:outline-none",
            listening ? "border-rose-500/40" : "border-zinc-800 focus:border-zinc-600",
          )}
        />
        {error && (
          <p className="mt-2 text-sm text-rose-300" role="alert">
            {error}
          </p>
        )}
        {replay && !saved && (
          <p className="mt-2 text-sm text-amber-300">
            No saved answer exists for this question, so replay cannot grade it. Turn replay off to grade live.
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          size="lg"
          disabled={listening || !text.trim()}
          onClick={() => onSubmit(text.trim(), elapsed)}
        >
          {submitLabel}
          <ArrowRightIcon className="h-5 w-5" />
        </Button>
        {replay && saved && text.trim() !== saved.transcript.trim() && (
          <Button variant="ghost" onClick={() => setText(saved.transcript)}>
            Use the saved answer
          </Button>
        )}
      </div>
    </Card>
  );
}
