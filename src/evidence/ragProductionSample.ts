/**
 * Frozen coach result for the production-RAG sample saved on 10 Oct 2026.
 *
 * The numbers, quotes, and gap text below are the ones shown on that result.
 * Seven of the nine points Nano rated were not included in the saved paste, so
 * those quotes are marked and are not treated as the candidate's words.
 * Both models marked both question parts addressed; the part citations use the
 * two quotes the sample did show.
 */
import { combineParts, combinePoints, combineSkills, pickGap } from "@/agent/rateSchema";
import { interviewTopics } from "@/data/topics/interview";
import { SHARED_CLAIMS } from "@/data/topics/sharedClaims";
import { UNRECORDED_QUOTE } from "@/lib/summary";
import type { AnswerPoint, Gap, ModelRating, RatedOutcome, Topic } from "@/types";

export const RAG_SAMPLE_TOPIC_ID = "rag-production-design";

export const NANO_MODEL = "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B";
export const ULTRA_MODEL = "nvidia/Nemotron-3-Ultra-550b-a55b";

export const BEST_QUOTE = "We will start with the best of injection means ingesting the documents";
export const WEAKEST_QUOTE = "Retrieve each question answer accordingly";

/** Not the candidate's words. Present only so the quality count stays at nine. */
export { UNRECORDED_QUOTE };

const CHUNK_BOUNDARIES =
  "Chunk boundaries follow the document structure so one fact is not split into pieces that never retrieve together";

const NANO_GAP_PLAIN =
  "You said you split documents into chunks but did not explain how the splits match the document structure. This is why retrieval may break facts across chunks.";

const ULTRA_GAP_PLAIN =
  "You say you will trace the answer path and check documents, but you do not describe a method to separate retrieval failures from generation failures, which is essential for debugging RAG systems.";

export function ragProductionTopic(): Topic {
  const topic = interviewTopics.find((t) => t.id === RAG_SAMPLE_TOPIC_ID);
  if (!topic) throw new Error(`Missing topic ${RAG_SAMPLE_TOPIC_ID}`);
  return topic;
}

function point(id: string, quote: string, reason = ""): { answer: AnswerPoint; rating: ModelRating["points"][string] } {
  return {
    answer: { id, quote },
    rating: {
      id,
      relevance: "related",
      quality: "vague",
      rubricLine: null,
      reason,
    },
  };
}

function gap(rubricLine: string, quote: string, plainLanguage: string): Gap {
  return {
    rubricLine,
    quote,
    missType: rubricLine,
    category: "missing-mechanism",
    plainLanguage,
  };
}

export function ragProductionOutcome(): Extract<RatedOutcome, { status: "graded" }> {
  const topic = ragProductionTopic();
  const [architecture, debug] = topic.parts ?? [];
  if (!architecture || !debug) throw new Error("RAG topic is missing its two parts");
  const skills = topic.skills ?? [];

  const made = [
    point("p1", BEST_QUOTE, "Mentions retrieval but not evaluation separation."),
    ...Array.from({ length: 7 }, (_, i) => point(`p${i + 2}`, UNRECORDED_QUOTE)),
    point("p9", WEAKEST_QUOTE, "Mentions multiple questions but not retrieval evaluation."),
  ];

  const nano: ModelRating = {
    parts: [
      { part: architecture, addressed: true, quote: BEST_QUOTE },
      { part: debug, addressed: true, quote: WEAKEST_QUOTE },
    ],
    points: Object.fromEntries(made.map((p) => [p.answer.id, p.rating])),
    skills: skills.map((skill) => ({ skill: skill.name, level: 1 as const })),
    gap: gap(CHUNK_BOUNDARIES, BEST_QUOTE, NANO_GAP_PLAIN),
  };

  const ultra: ModelRating = {
    parts: [
      { part: architecture, addressed: true, quote: BEST_QUOTE },
      { part: debug, addressed: true, quote: WEAKEST_QUOTE },
    ],
    points: {},
    skills: skills.map((skill) => ({ skill: skill.name, level: 2 as const })),
    gap: gap(SHARED_CLAIMS.retrievalEval, WEAKEST_QUOTE, ULTRA_GAP_PLAIN),
  };

  const points = combinePoints(
    made.map((p) => p.answer),
    nano,
    ultra,
  );

  return {
    status: "graded",
    parts: combineParts(topic.parts ?? [], nano, ultra),
    points,
    skills: combineSkills(skills, nano, ultra),
    gap: pickGap(points, nano, ultra),
    gaps: { nano: nano.gap, ultra: ultra.gap },
    supported: [],
    models: { extract: NANO_MODEL, nano: NANO_MODEL, ultra: ULTRA_MODEL },
    partial: false,
    replay: false,
    calls: [],
  };
}
