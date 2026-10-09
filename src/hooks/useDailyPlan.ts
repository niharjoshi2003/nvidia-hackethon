import { useMemo } from "react";
import { useStore } from "./useStore";
import { buildDailyPlan, dayKey } from "@/lib/selection";
import { openMisses } from "@/lib/misses";
import type { PlanEntry } from "@/types";

/**
 * Today's plan, rebuilt from current state rather than cached.
 *
 * buildDailyPlan is deterministic for a given day, so recomputing is both
 * cheap and correct. Caching it would mean resolving a miss did not change the
 * plan until tomorrow, which would hide the one behaviour worth showing.
 */
export function useDailyPlan(): PlanEntry[] {
  const { state, topics } = useStore();

  return useMemo(() => {
    const open = openMisses(state.misses);
    return buildDailyPlan({
      topics,
      progress: state.progress,
      openMissTopicIds: open.map((m) => m.topicId),
      missLabels: Object.fromEntries(open.map((m) => [m.topicId, m.missType])),
      planSize: state.settings.planSize,
      now: new Date(),
    });
    // dayKey is in the dependency list so the first render after midnight
    // builds the new day's plan instead of reusing yesterday's memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topics, state.progress, state.misses, state.settings.planSize, dayKey(new Date())]);
}
