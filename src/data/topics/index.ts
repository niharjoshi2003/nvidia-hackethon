import type { Topic } from "@/types";
import { agenticTopics } from "./agentic";
import { systemDesignTopics } from "./systemDesign";
import { llmCoreTopics } from "./llmCore";
import { sweTopics } from "./swe";

export const seedTopics: Topic[] = [
  ...agenticTopics,
  ...systemDesignTopics,
  ...llmCoreTopics,
  ...sweTopics,
];

const seedById = new Map(seedTopics.map((t) => [t.id, t]));

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
