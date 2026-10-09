import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useStore } from "@/hooks/useStore";
import { findTopic } from "@/data/topics";
import { clearPendingAttempt, peekPendingAttempt } from "@/audio/pendingAttempt";
import { gradeSpokenAnswer } from "@/agent/gradeSpokenAnswer";
import { priorMissOnSameLine } from "@/lib/misses";
import { MISS_CATEGORY_LABELS, type GradeOutcome, type SelfRating } from "@/types";
import {
  Badge,
  Button,
  Card,
  Empty,
  PageTitle,
  RubricLine,
  SectionLabel,
  SpokenQuote,
} from "@/components/ui";

const RATING_FIELDS: Array<{ key: keyof SelfRating; label: string }> = [
  { key: "clarity", label: "Clarity" },
  { key: "depth", label: "Depth" },
  { key: "structure", label: "Structure" },
];

export default function Debrief() {
  const { topicId = "" } = useParams();
  const navigate = useNavigate();
  const { state, saveAttempt } = useStore();
  const topic = findTopic(topicId, state.importedTopics);

  const [pending] = useState(() => peekPendingAttempt());
  const [grade, setGrade] = useState<GradeOutcome | null>(null);
  const [grading, setGrading] = useState(false);
  const [ratings, setRatings] = useState<SelfRating>({ clarity: 3, depth: 3, structure: 3 });
  const [note, setNote] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (!pending) navigate("/", { replace: true });
  }, [pending, navigate]);

  // Leaving by any route (nav bar, back button) drops the attempt, so the
  // recording is never kept past this screen. The attempt itself is held in
  // state above, so StrictMode's simulated remount does not lose it.
  useEffect(() => () => clearPendingAttempt(), []);

  // Grade once. The ref survives StrictMode's remount, so development does not
  // spend two grades on every attempt.
  useEffect(() => {
    if (!topic || !pending || started.current) return;
    started.current = true;

    setGrading(true);
    void gradeSpokenAnswer({
      topic,
      transcript: pending.transcript,
      ownApiKey: state.settings.ownApiKey || undefined,
    })
      .then(setGrade)
      .finally(() => setGrading(false));
  }, [topic, pending, state.settings.ownApiKey]);

  if (!topic) return <Empty title="That topic is not in the library" />;
  if (!pending) return null;

  const save = () => {
    saveAttempt({
      topicId: topic.id,
      spokenSeconds: pending.spokenSeconds,
      ratings,
      note: note.trim(),
      transcript: pending.transcript || null,
      grade,
    });
    clearPendingAttempt();
    navigate("/");
  };

  return (
    <div>
      <PageTitle sub={`${pending.spokenSeconds}s on "${topic.title}"`}>Debrief</PageTitle>

      <div className="mb-6">
        <SectionLabel>What the evaluator found</SectionLabel>
        {grading ? (
          <Card>
            <p className="text-sm text-zinc-300">
              Reading your answer against this topic&rsquo;s rubric.
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              One Nemotron model finds which points you covered, then a larger one picks the single
              miss that matters most.
            </p>
          </Card>
        ) : (
          <GradeResult grade={grade} allMisses={state.misses} />
        )}
      </div>

      <Card className="mb-4">
        <SectionLabel>How did it feel?</SectionLabel>
        <div className="space-y-3">
          {RATING_FIELDS.map((field) => (
            <div key={field.key} className="flex items-center gap-3">
              <span className="w-20 text-sm text-zinc-400">{field.label}</span>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-label={`${field.label} ${n} of 5`}
                    aria-pressed={ratings[field.key] === n}
                    onClick={() => setRatings((r) => ({ ...r, [field.key]: n }))}
                    className={
                      ratings[field.key] === n
                        ? "h-8 w-8 rounded border border-amber-400 bg-amber-400 text-sm font-medium text-zinc-950"
                        : "h-8 w-8 rounded border border-zinc-700 text-sm text-zinc-400 hover:border-zinc-500"
                    }
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mb-6">
        <SectionLabel>What did you forget?</SectionLabel>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="In your own words, before you take the evaluator's."
          className="w-full resize-y rounded border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
        />
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={save} disabled={!note.trim() || grading}>
          Save and schedule
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            clearPendingAttempt();
            navigate("/");
          }}
        >
          Discard this attempt
        </Button>
      </div>
      {!note.trim() && (
        <p className="mt-3 text-xs text-zinc-500">
          Write your own answer first. Your judgment is the thing being trained.
        </p>
      )}
    </div>
  );
}

/**
 * Four outcomes, each shown plainly.
 *
 * A rejection is presented as the evaluator declining, not as a system error,
 * because that is what it is: the model produced something it could not back
 * with a quote and a rubric line, and the gate stopped it reaching you.
 */
function GradeResult({
  grade,
  allMisses,
}: {
  grade: GradeOutcome | null;
  allMisses: import("@/types").SpokenMiss[];
}) {
  if (!grade) {
    return (
      <Card>
        <p className="text-sm text-zinc-400">No grade ran for this attempt.</p>
      </Card>
    );
  }

  if (grade.status === "skipped") {
    return (
      <Card>
        <p className="text-sm text-zinc-300">There was nothing to grade.</p>
        <p className="mt-1 text-sm text-zinc-500">
          No model was called, so this attempt cost nothing.
        </p>
      </Card>
    );
  }

  if (grade.status === "failed") {
    const quota = grade.reason === "quota-reached" || grade.reason === "rate-limited";
    return (
      <Card className="border-zinc-700">
        <p className="text-sm text-zinc-300">
          {quota ? "The shared demo budget is used up." : "The grade did not run."}
        </p>
        <p className="mt-1 text-sm text-zinc-500">
          {quota
            ? "Add your own Token Factory key in Settings to keep grading."
            : grade.detail}
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          Your rating below still saves, and no miss was invented.
        </p>
      </Card>
    );
  }

  if (grade.status === "rejected") {
    return (
      <Card className="border-rose-500/30 bg-rose-500/5">
        <Badge tone="bad">Declined</Badge>
        <p className="mt-2 text-sm text-zinc-200">
          The evaluator produced a judgment it could not support, so it was discarded.
        </p>
        <p className="mt-1 text-sm text-zinc-400">
          {grade.reason === "quote-not-in-transcript"
            ? "It quoted words you did not say."
            : grade.reason === "rubric-line-not-supplied"
              ? "It reworded the rubric instead of citing it."
              : grade.reason === "clean-contradicts-coverage"
                ? "It said nothing was missed, but the first pass could not confirm every key point."
                : grade.detail}
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          Nothing was stored. You are seeing this instead of a confident paragraph that was not
          backed by anything.
        </p>
      </Card>
    );
  }

  if (grade.status === "clean") {
    return (
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <Badge tone="good">Nothing missed</Badge>
        <p className="mt-2 text-sm text-zinc-200">
          Both passes agree you covered every key point on this topic&rsquo;s rubric.
        </p>
        <p className="mt-1 text-sm text-zinc-500">
          No miss was invented to fill the space. Any open miss this answer covered is now closed.
        </p>
        <p className="mt-3 font-mono text-[11px] text-zinc-500">
          {grade.models.coverage} and {grade.models.judgment}, on Nebius Token Factory
        </p>
      </Card>
    );
  }

  const { miss } = grade;
  const prior = priorMissOnSameLine(allMisses, {
    ...miss,
    id: "pending",
    status: "open",
    resolvedAt: null,
    resolvedBy: null,
  });

  return (
    <>
      <Card className="border-amber-500/30">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge tone="accent">Miss</Badge>
          <span className="text-sm font-medium text-zinc-100">{miss.missType}</span>
          <Badge>{MISS_CATEGORY_LABELS[miss.category]}</Badge>
        </div>

        <p className="text-sm text-zinc-200">{miss.plainLanguage}</p>

        <div className="mt-4 space-y-3">
          <div>
            <p className="mb-1 text-xs uppercase tracking-wider text-zinc-500">You said</p>
            <SpokenQuote>{miss.quote}</SpokenQuote>
          </div>
          <div>
            <p className="mb-1 text-xs uppercase tracking-wider text-zinc-500">
              The rubric line it missed
            </p>
            <RubricLine>{miss.rubricLine}</RubricLine>
          </div>
        </div>

        <div className="mt-4 border-t border-zinc-800 pt-3">
          <p className="mb-1.5 text-xs uppercase tracking-wider text-zinc-500">Which models ran</p>
          <ul className="space-y-1">
            {miss.calls.map((call, i) => (
              <li key={i} className="flex flex-wrap gap-x-2 font-mono text-[11px] text-zinc-500">
                <span className="text-zinc-400">{call.model}</span>
                <span>
                  {call.purpose === "coverage" ? "found what you covered" : "chose the miss"}
                </span>
                <span>{call.ms}ms</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-zinc-600">
            NVIDIA Nemotron on Nebius Token Factory. The quote above was checked against your
            transcript and the rubric line against this topic, before either was shown.
          </p>
        </div>
      </Card>

      {prior && (
        <Card className="mt-3">
          <SectionLabel>You missed this same line before</SectionLabel>
          <p className="mb-2 text-xs text-zinc-500">
            {new Date(prior.at).toLocaleDateString()} — you said:
          </p>
          <SpokenQuote>{prior.quote}</SpokenQuote>
        </Card>
      )}

      {grade.coverage.covered.length > 0 && (
        <Card className="mt-3">
          <SectionLabel>You did cover</SectionLabel>
          <ul className="space-y-1.5">
            {grade.coverage.covered.map((line) => (
              <li key={line} className="text-sm text-zinc-400">
                {line}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
