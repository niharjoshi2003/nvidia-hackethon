import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  clearPendingAttempt,
  peekPendingAttempt,
  setPendingAttempt,
} from "@/audio/pendingAttempt";
import { findTopic } from "@/data/topics";
import { useStore } from "@/hooks/useStore";
import { wordCount } from "@/lib/text";
import { MIN_WORDS_TO_GRADE } from "@/agent/gradeSpokenAnswer";
import { Button, Card, Empty, PageTitle, SectionLabel } from "@/components/ui";

/**
 * Transcript review, between speaking and being graded.
 *
 * Exists because browser speech recognition is unreliable: it drops words, it
 * is unsupported in some browsers, and it can fail entirely. Letting the
 * speaker correct the text first means a transcription failure costs a few
 * seconds of typing instead of invalidating the attempt.
 *
 * It is also the consent point. This is the screen that says, before anything
 * is sent, exactly what will leave the browser.
 */
export default function Review() {
  const { topicId = "" } = useParams();
  const navigate = useNavigate();
  const { state } = useStore();
  const topic = findTopic(topicId, state.importedTopics);

  const [pending] = useState(() => peekPendingAttempt());
  const [text, setText] = useState(pending?.transcript ?? "");
  const advancing = useRef(false);

  useEffect(() => {
    // Reached by reload or a direct link, with no attempt in memory.
    if (!pending) navigate(`/explain/${topicId}`, { replace: true });
  }, [pending, navigate, topicId]);

  // Leaving for anywhere but the debrief drops the attempt and its audio.
  useEffect(
    () => () => {
      if (!advancing.current) clearPendingAttempt();
    },
    [],
  );

  if (!topic) return <Empty title="That topic is not in the library" />;
  if (!pending) return null;

  const words = wordCount(text);
  const tooShort = words < MIN_WORDS_TO_GRADE;

  const proceed = () => {
    advancing.current = true;
    setPendingAttempt({ ...pending, transcript: text.trim() });
    navigate(`/debrief/${topic.id}`);
  };

  const discard = () => {
    clearPendingAttempt();
    navigate("/");
  };

  return (
    <div>
      <PageTitle sub={`${pending.spokenSeconds}s on "${topic.title}"`}>
        Check what you said
      </PageTitle>

      {pending.transcriptUnavailable && (
        <Card className="mb-4 border-rose-500/30 bg-rose-500/5">
          <p className="text-sm text-zinc-200">
            Nothing was transcribed. Your browser may not support speech recognition, or the
            microphone caught nothing.
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            You can type what you said and still get it graded, or skip grading and just rate
            yourself.
          </p>
        </Card>
      )}

      <Card className="mb-4">
        <SectionLabel>Transcript</SectionLabel>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          autoFocus
          placeholder="Type what you said."
          className="w-full resize-y rounded border border-zinc-800 bg-zinc-950 p-3 text-sm leading-relaxed text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
        />
        <p className="mt-2 text-xs text-zinc-500">
          {words} word{words === 1 ? "" : "s"}. Fix anything the transcription got wrong — the
          evaluator quotes this text back to you, so errors here become confusing citations.
        </p>
      </Card>

      <Card className="mb-6">
        <SectionLabel>What leaves this browser</SectionLabel>
        <p className="text-sm text-zinc-300">
          The text above and this topic&rsquo;s rubric lines, sent to NVIDIA Nemotron models on
          Nebius Token Factory.
        </p>
        <p className="mt-1.5 text-sm text-zinc-500">
          Your audio recording is not sent and is discarded when you leave. Your ratings, notes, and
          miss history stay in this browser. Note that speech recognition itself runs through your
          browser&rsquo;s own speech service, not on your machine.
        </p>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button variant="primary" onClick={proceed} disabled={tooShort}>
          Grade this answer
        </Button>
        <Button onClick={proceed} disabled={!tooShort}>
          Skip grading, just rate myself
        </Button>
        <Button variant="ghost" onClick={discard}>
          Discard
        </Button>
      </div>
      {tooShort && (
        <p className="mt-3 text-xs text-zinc-500">
          Too short to grade. Add what you said, or continue to rate yourself without a grade.
        </p>
      )}
    </div>
  );
}
