/**
 * The single writer to local state.
 *
 * Screens read from here and call these actions; nothing else touches
 * localStorage. The grading path in src/agent never writes — it returns an
 * outcome and a screen decides whether it becomes a miss, which keeps the
 * model strictly out of the memory it will later be shown.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  type AppState,
  type Attempt,
  type DisputeLabel,
  type GradeOutcome,
  type RatedOutcome,
  type SelfRating,
  type Settings,
  type SpokenMiss,
  type Topic,
} from "@/types";
import { emptyState, loadState, saveState } from "@/lib/storage";
import { emptyProgress, nextSchedule } from "@/lib/scheduler";
import { missesToResolve } from "@/lib/misses";
import { missesClosedOnTwin } from "@/lib/closure";
import { allTopics } from "@/data/topics";
import { uid } from "@/lib/id";

export interface SaveAttemptInput {
  topicId: string;
  spokenSeconds: number;
  ratings: SelfRating;
  note: string;
  transcript: string | null;
  /** Null when grading never ran. */
  grade: GradeOutcome | null;
}

export interface SaveCoachRoundInput {
  topic: Topic;
  transcript: string;
  spokenSeconds: number;
  outcome: RatedOutcome;
}

export interface CoachRoundResult {
  attempt: Attempt;
  miss: SpokenMiss | null;
  /** Open misses from other questions that this answer closed. */
  closed: SpokenMiss[];
}

interface StoreValue {
  state: AppState;
  topics: Topic[];
  /** Records the attempt, updates the schedule, and appends a miss if graded. */
  saveAttempt(input: SaveAttemptInput): { attempt: Attempt; miss: SpokenMiss | null };
  /**
   * Records a coach round. Stores the gap as a miss, and closes open misses
   * only when a justified point supports the line on a different question.
   */
  saveCoachRound(input: SaveCoachRoundInput): CoachRoundResult;
  recordDispute(label: Omit<DisputeLabel, "id" | "at">): void;
  resolveMiss(missId: string): void;
  reopenMiss(missId: string): void;
  setNote(topicId: string, note: string): void;
  updateSettings(patch: Partial<Settings>): void;
  importTopics(topics: Topic[]): void;
  removeImportedTopic(topicId: string): void;
  reset(): void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => loadState());
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    saveState(state);
  }, [state]);

  const topics = useMemo(() => allTopics(state.importedTopics), [state.importedTopics]);

  const saveAttempt = useCallback((input: SaveAttemptInput) => {
    const attempt: Attempt = {
      id: uid("att"),
      topicId: input.topicId,
      at: new Date().toISOString(),
      spokenSeconds: input.spokenSeconds,
      ratings: input.ratings,
      note: input.note,
      transcript: input.transcript,
    };

    let created: SpokenMiss | null = null;

    setState((prev) => {
      const current = prev.progress[input.topicId] ?? emptyProgress(input.topicId);
      const progress = {
        ...prev.progress,
        [input.topicId]: nextSchedule(current, input.ratings, new Date(attempt.at)),
      };

      let misses = prev.misses;
      const grade = input.grade;

      if (grade?.status === "graded" || grade?.status === "clean") {
        // Close anything this answer now covers, before adding the new miss, so
        // a line cited again today is not closed by the same grade that raised it.
        const closing = new Set(
          missesToResolve(misses, input.topicId, grade.coverage.covered).map((m) => m.id),
        );
        if (closing.size > 0) {
          misses = misses.map((m) =>
            closing.has(m.id)
              ? { ...m, status: "resolved" as const, resolvedAt: attempt.at, resolvedBy: "later-grade" as const }
              : m,
          );
        }
      }

      if (grade?.status === "graded") {
        created = {
          ...grade.miss,
          id: uid("miss"),
          attemptId: attempt.id,
          status: "open",
          resolvedAt: null,
          resolvedBy: null,
        };
        misses = [...misses, created];
      }

      return {
        ...prev,
        attempts: [...prev.attempts, attempt],
        progress,
        misses,
        gradeStats: tallyGrade(prev.gradeStats, input.grade),
      };
    });

    return { attempt, miss: created };
  }, []);

  const saveCoachRound = useCallback((input: SaveCoachRoundInput): CoachRoundResult => {
    const at = new Date().toISOString();
    const attempt: Attempt = {
      id: uid("att"),
      topicId: input.topic.id,
      at,
      spokenSeconds: input.spokenSeconds,
      ratings: { clarity: 3, depth: 3, structure: 3 },
      note: "Coach session",
      transcript: input.transcript || null,
    };

    const { outcome } = input;
    const graded = outcome.status === "graded" ? outcome : null;
    const closed = graded
      ? missesClosedOnTwin(stateRef.current.misses, input.topic, graded.supported)
      : [];
    const closing = new Set(closed.map((m) => m.id));

    const miss: SpokenMiss | null = graded?.gap
      ? {
          id: uid("miss"),
          topicId: input.topic.id,
          attemptId: attempt.id,
          at,
          status: "open",
          missType: graded.gap.missType,
          category: graded.gap.category,
          quote: graded.gap.quote,
          rubricLine: graded.gap.rubricLine,
          plainLanguage: graded.gap.plainLanguage,
          models: {
            coverage: graded.models.nano ?? "none",
            judgment: graded.models.ultra ?? "none",
          },
          calls: graded.calls,
          resolvedAt: null,
          resolvedBy: null,
        }
      : null;

    setState((prev) => {
      let misses = prev.misses.map((m) =>
        closing.has(m.id) && m.status === "open"
          ? { ...m, status: "resolved" as const, resolvedAt: at, resolvedBy: "later-grade" as const }
          : m,
      );
      if (miss) misses = [...misses, miss];
      return { ...prev, attempts: [...prev.attempts, attempt], misses };
    });

    return { attempt, miss, closed };
  }, []);

  const recordDispute = useCallback((label: Omit<DisputeLabel, "id" | "at">) => {
    setState((prev) => ({
      ...prev,
      labels: [
        ...prev.labels.filter(
          (l) => !(l.attemptId === label.attemptId && l.line === label.line && l.topicId === label.topicId),
        ),
        { ...label, id: uid("lbl"), at: new Date().toISOString() },
      ],
    }));
  }, []);

  const resolveMiss = useCallback((missId: string) => {
    setState((prev) => ({
      ...prev,
      misses: prev.misses.map((m) =>
        m.id === missId
          ? { ...m, status: "resolved", resolvedAt: new Date().toISOString(), resolvedBy: "user" }
          : m,
      ),
    }));
  }, []);

  const reopenMiss = useCallback((missId: string) => {
    setState((prev) => ({
      ...prev,
      misses: prev.misses.map((m) =>
        m.id === missId ? { ...m, status: "open", resolvedAt: null, resolvedBy: null } : m,
      ),
    }));
  }, []);

  const setNote = useCallback((topicId: string, note: string) => {
    setState((prev) => ({ ...prev, notes: { ...prev.notes, [topicId]: note } }));
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setState((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
  }, []);

  const importTopics = useCallback((incoming: Topic[]) => {
    setState((prev) => {
      const existing = new Set(prev.importedTopics.map((t) => t.id));
      return {
        ...prev,
        importedTopics: [...prev.importedTopics, ...incoming.filter((t) => !existing.has(t.id))],
      };
    });
  }, []);

  const removeImportedTopic = useCallback((topicId: string) => {
    setState((prev) => ({
      ...prev,
      importedTopics: prev.importedTopics.filter((t) => t.id !== topicId),
    }));
  }, []);

  const reset = useCallback(() => setState(emptyState()), []);

  const value = useMemo<StoreValue>(
    () => ({
      state,
      topics,
      saveAttempt,
      saveCoachRound,
      recordDispute,
      resolveMiss,
      reopenMiss,
      setNote,
      updateSettings,
      importTopics,
      removeImportedTopic,
      reset,
    }),
    [
      state,
      topics,
      saveAttempt,
      saveCoachRound,
      recordDispute,
      resolveMiss,
      reopenMiss,
      setNote,
      updateSettings,
      importTopics,
      removeImportedTopic,
      reset,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/**
 * Counts every grade the evaluator was asked for, including the ones it
 * declined. The refusal rate is a headline number, not an error log.
 */
function tallyGrade(stats: AppState["gradeStats"], grade: GradeOutcome | null) {
  if (!grade || grade.status === "skipped") return stats;
  return {
    attempted: stats.attempted + 1,
    accepted: stats.accepted + (grade.status === "graded" ? 1 : 0),
    clean: stats.clean + (grade.status === "clean" ? 1 : 0),
    rejected: stats.rejected + (grade.status === "rejected" ? 1 : 0),
    failed: stats.failed + (grade.status === "failed" ? 1 : 0),
  };
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStore must be used inside a StoreProvider");
  return value;
}
