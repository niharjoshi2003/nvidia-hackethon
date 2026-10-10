import type { Topic } from "@/types";
import { agenticTopics } from "./agentic";
import { interviewTopics } from "./interview";
import { systemDesignTopics } from "./systemDesign";
import { llmCoreTopics } from "./llmCore";
import { sweTopics } from "./swe";

export const seedTopics: Topic[] = [
  ...agenticTopics,
  ...systemDesignTopics,
  ...llmCoreTopics,
  ...sweTopics,
  ...interviewTopics,
];

/**
 * The eight coach questions. Seven are new; tool retries already existed.
 * Order follows the content table in the plan, not the catalog order.
 */
export const COACH_TOPIC_IDS = [
  "rag-production-design",
  "rag-contract-debug",
  "agent-safe-tools",
  "agentic-tool-retries",
  "eval-llm-feature",
  "eval-agent-not-call",
  "prod-cost-latency",
  "prod-defend-model",
] as const;

const seedById = new Map(seedTopics.map((t) => [t.id, t]));

export function coachTopics(): Topic[] {
  return COACH_TOPIC_IDS.map((id) => {
    const topic = seedById.get(id);
    if (!topic) throw new Error(`coach topic missing: ${id}`);
    return topic;
  });
}

/**
 * Look a topic up across seeds and anything the user imported.
 *
 * Imported topics are passed in rather than read from storage so this stays a
 * pure function: the grading path and the tests can both call it without a
 * browser or a store.
 */
export function findTopic(id: string, imported: Topic[] = []): Topic | undefined {
  return seedById.get(id) ?? imported.find((t) => t.id === id);
}

export function allTopics(imported: Topic[] = []): Topic[] {
  return [...seedTopics, ...imported];
}
