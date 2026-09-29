import { Link, useParams } from "react-router-dom";
import { useStore } from "@/hooks/useStore";
import { findTopic } from "@/data/topics";
import { latestOpenMiss } from "@/lib/misses";
import { TRACK_LABELS } from "@/types";
import { MissCard } from "@/components/MissCard";
import { Button, Card, Empty, PageTitle, SectionLabel } from "@/components/ui";

export default function Research() {
  const { topicId = "" } = useParams();
  const { state, setNote } = useStore();
  const topic = findTopic(topicId, state.importedTopics);

  if (!topic) return <Empty title="That topic is not in the library" />;

  const miss = latestOpenMiss(state.misses, topic.id);
  const note = state.notes[topic.id] ?? "";

  return (
    <div>
      <PageTitle sub={TRACK_LABELS[topic.track]}>{topic.title}</PageTitle>

      {/* Shown before the timer, on purpose. The point of storing a miss is
          that you see it again when it can still change the next answer. */}
      {miss && (
        <div className="mb-6">
          <SectionLabel>Last time, on this topic</SectionLabel>
          <MissCard miss={miss} />
        </div>
      )}

      <Card className="mb-6">
        <SectionLabel>How it gets asked</SectionLabel>
        <p className="text-sm text-zinc-200">{topic.framing}</p>
        <ul className="mt-3 space-y-1">
          {topic.interviewQuestions.map((q) => (
            <li key={q} className="text-sm text-zinc-400">
              {q}
            </li>
          ))}
        </ul>
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <SectionLabel>Cover these</SectionLabel>
          <ul className="space-y-2">
            {topic.scaffold.keyPoints.map((point) => (
              <li key={point} className="text-sm text-zinc-300">
                {point}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <SectionLabel>Traps</SectionLabel>
          <ul className="space-y-2">
            {topic.scaffold.commonGotchas.map((gotcha) => (
              <li key={gotcha} className="text-sm text-zinc-300">
                {gotcha}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mb-6">
        <SectionLabel>Shape of the minute</SectionLabel>
        <ol className="space-y-1.5">
          {topic.scaffold.sixtySecondStructure.map((beat, i) => (
            <li key={beat} className="flex gap-3 text-sm text-zinc-300">
              <span className="shrink-0 font-mono text-xs text-zinc-600">{i + 1}</span>
              {beat}
            </li>
          ))}
        </ol>
      </Card>

      <Card className="mb-6">
        <SectionLabel>Your notes</SectionLabel>
        <textarea
          value={note}
          onChange={(e) => setNote(topic.id, e.target.value)}
          rows={4}
          placeholder="Whatever you want in front of you before you speak."
          className="w-full resize-y rounded border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
        />
      </Card>

      <div className="flex gap-3">
        <Link to={`/explain/${topic.id}`}>
          <Button variant="primary">Start the timer</Button>
        </Link>
        <Link to="/">
          <Button variant="ghost">Back to today</Button>
        </Link>
      </div>
    </div>
  );
}
