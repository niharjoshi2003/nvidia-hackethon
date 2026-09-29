/**
 * Rubric import.
 *
 * The evaluator is not specific to interview prep — it grades a spoken answer
 * against whatever rubric it is handed. Letting a user bring their own rubric
 * turns this from one person's interview drill into something usable for any
 * spoken skill that has a checklist: a clinical viva, a sales pitch, a
 * language exam, an internal competency framework.
 *
 * The import is deliberately strict. A rubric with vague lines produces vague
 * misses, so the validation enforces the same standard the seed topics are
 * held to by their tests.
 */

import { z } from "zod";
import { normalize } from "./text";
import { TRACK_LABELS, type Topic, type Track } from "@/types";

const MIN_WORDS_PER_LINE = 6;

const rubricLine = z
  .string()
  .trim()
  .min(1)
  .max(400)
  .refine((line) => line.split(/\s+/).length >= MIN_WORDS_PER_LINE, {
    message: `each line needs at least ${MIN_WORDS_PER_LINE} words, or the evaluator can only produce a vague miss`,
  });

const importedTopicSchema = z.object({
  title: z.string().trim().min(3).max(120),
  track: z.custom<Track>((v) => typeof v === "string" && v in TRACK_LABELS, {
    message: `track must be one of: ${Object.keys(TRACK_LABELS).join(", ")}`,
  }),
  difficulty: z.enum(["foundational", "core", "advanced"]).optional(),
  framing: z.string().trim().min(10).max(400),
  interviewQuestions: z.array(z.string().trim().min(5)).max(6).optional(),
  keyPoints: z.array(rubricLine).min(3).max(10),
  commonGotchas: z.array(rubricLine).max(6).optional(),
  modelAnswer: z.array(rubricLine).min(1).max(8),
  sixtySecondStructure: z.array(z.string().trim().min(3)).max(8).optional(),
  followUps: z.array(z.string().trim().min(3)).max(6).optional(),
});

const fileSchema = z.union([importedTopicSchema, z.array(importedTopicSchema).min(1).max(50)]);

export type ImportResult =
  | { ok: true; topics: Topic[] }
  | { ok: false; error: string };

export function parseRubricFile(raw: string, existingIds: string[] = []): ImportResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: "That is not valid JSON." };
  }

  const parsed = fileSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    return { ok: false, error: `${where}${issue?.message ?? "the rubric did not validate"}` };
  }

  const entries = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
  const taken = new Set(existingIds);
  const topics: Topic[] = [];

  for (const entry of entries) {
    const gotchas = entry.commonGotchas ?? [];
    const lines = [...entry.keyPoints, ...gotchas, ...entry.modelAnswer];

    // The citation gate resolves a cited line by normalised equality, so a
    // duplicate would make attribution ambiguous.
    const normalised = lines.map(normalize);
    if (new Set(normalised).size !== normalised.length) {
      return {
        ok: false,
        error: `"${entry.title}" repeats a rubric line. Every line must be distinct.`,
      };
    }

    const id = uniqueId(entry.title, taken);
    taken.add(id);

    topics.push({
      id,
      track: entry.track,
      title: entry.title,
      difficulty: entry.difficulty ?? "core",
      framing: entry.framing,
      interviewQuestions: entry.interviewQuestions ?? [],
      modelAnswer: entry.modelAnswer,
      scaffold: {
        keyPoints: entry.keyPoints,
        commonGotchas: gotchas,
        sixtySecondStructure: entry.sixtySecondStructure ?? [],
        followUps: entry.followUps ?? [],
      },
      source: "imported",
    });
  }

  return { ok: true, topics };
}

function uniqueId(title: string, taken: Set<string>): string {
  const base =
    `imported-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
      .replace(/-+/g, "-")
      .replace(/-$/, "")
      .slice(0, 60) || "imported-topic";
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export const EXAMPLE_RUBRIC = JSON.stringify(
  {
    title: "Explaining a delayed delivery to an unhappy customer",
    track: "swe",
    framing: "A customer's order is two weeks late and they are angry. Talk me through the call.",
    keyPoints: [
      "Acknowledge the specific impact on the customer before offering any explanation",
      "State what actually went wrong without blaming another team or the system",
      "Give a concrete new date rather than a vague reassurance that it is coming",
      "Offer a specific remedy and say clearly what you can and cannot authorise",
    ],
    commonGotchas: [
      "Leading with an explanation before acknowledging the impact on the customer",
      "Promising a date that depends on something you do not control",
    ],
    modelAnswer: [
      "The call opens by naming the impact on the customer, not the cause of the delay",
      "The commitment given is one the speaker can personally guarantee",
    ],
  },
  null,
  2,
);
