import { useState } from "react";
import { Button, Card, PageTitle } from "@/components/ui";
import { ragProductionOutcome, ragProductionTopic } from "@/evidence/ragProductionSample";
import type { Round } from "@/lib/session";
import { CoachResult, QuestionCard } from "./Coach";

/**
 * The saved production-RAG result, rendered with the coach result screen.
 * Open /evidence/rag-production-sample after `npm run dev`.
 */
export default function EvidenceSample() {
  const topic = ragProductionTopic();
  const outcome = ragProductionOutcome();
  const [showNote, setShowNote] = useState(true);

  const round: Round = {
    topicId: topic.id,
    kind: "opening",
    prompt: topic.framing,
    reason: "Saved sample",
    targetLine: null,
    transcript: "",
    spokenSeconds: 0,
    outcome,
    attemptId: null,
    decisions: {},
  };

  return (
    <div data-evidence-root>
      <PageTitle sub="Saved sample · 10 Oct 2026 · production RAG grade">Coach</PageTitle>

      {showNote && (
        <Card className="mb-4 border-sky-500/30 bg-sky-500/5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-zinc-300">
              Archived result from the paste saved on 10 Oct 2026. Verdict, model cards, and the two
              quoted lines are from that result. Seven of the nine points Nano rated were not in the
              paste; those rows are marked instead of filled in with guessed words.
            </p>
            <Button size="sm" variant="ghost" onClick={() => setShowNote(false)}>
              Hide
            </Button>
          </div>
        </Card>
      )}

      <QuestionCard round={round} topic={topic} />
      <CoachResult
        topic={topic}
        outcome={outcome}
        trace={[]}
        closed={[]}
        topicTitle={(id) => (id === topic.id ? topic.title : id)}
        canSwitchToReplay={false}
        onSwitchToReplay={() => {}}
      />

      <div className="mt-4 flex flex-wrap gap-3">
        <Button variant="primary" type="button">
          Next: the follow-up
        </Button>
        <Button variant="ghost" type="button">
          End session
        </Button>
      </div>
    </div>
  );
}
