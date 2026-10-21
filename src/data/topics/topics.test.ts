import { describe, expect, it } from "vitest";
import { coachTopics, seedTopics } from "./index";
import { ROLE_LABELS, rubricLines, SOURCE_LABELS, type RoleTrack } from "@/types";
import { normalize } from "@/lib/text";

/**
 * These guard the rubric quality the whole product depends on.
 *
 * The citation gate canonicalises a cited line by finding the first supplied
 * line that normalises equal to it. If a topic contained the same line twice,
 * or two lines that differ only in whitespace, that lookup would be ambiguous
 * and a miss could be attributed to the wrong rubric entry. These tests make
 * that impossible to introduce by accident.
 */
describe("seed topic rubrics", () => {
  it("has a unique id for every topic", () => {
    const ids = seedTopics.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(seedTopics.map((t) => [t.id, t] as const))(
    "%s has rubric lines that are unique after normalisation",
    (_id, topic) => {
      const lines = rubricLines(topic).map(normalize);
      expect(new Set(lines).size).toBe(lines.length);
    },
  );

  it.each(seedTopics.map((t) => [t.id, t] as const))(
    "%s has enough rubric detail to produce a specific miss",
    (_id, topic) => {
      expect(topic.scaffold.keyPoints.length).toBeGreaterThanOrEqual(5);
      expect(topic.scaffold.commonGotchas.length).toBeGreaterThanOrEqual(2);
      expect(topic.modelAnswer.length).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(seedTopics.map((t) => [t.id, t] as const))(
    "%s has rubric lines specific enough to quote back to a learner",
    (_id, topic) => {
      for (const line of rubricLines(topic)) {
        // A line the evaluator must copy verbatim has to read as a full claim.
        // Short fragments like "error handling" produce exactly the vague miss
        // this project exists to avoid.
        expect(line.trim().split(/\s+/).length).toBeGreaterThanOrEqual(6);
        expect(line).not.toMatch(/\.$/);
      }
    },
  );

  it("covers every track", () => {
    expect(new Set(seedTopics.map((t) => t.track)).size).toBe(4);
  });
});

describe("coach questions", () => {
  const coaches = coachTopics();
  const byId = new Map(coaches.map((topic) => [topic.id, topic]));

  it("is the fourteen-question set", () => {
    expect(coaches).toHaveLength(14);
    expect(new Set(coaches.map((topic) => topic.id)).size).toBe(14);
  });

  it("covers both role tracks with enough questions for a session", () => {
    for (const role of Object.keys(ROLE_LABELS) as RoleTrack[]) {
      const count = coaches.filter((topic) => topic.roles?.includes(role)).length;
      expect(count).toBeGreaterThanOrEqual(4);
    }
  });

  it.each(coaches.map((topic) => [topic.id, topic] as const))(
    "%s has a source, roles, competencies, and a pending or signed review",
    (_id, topic) => {
      expect(topic.roles?.length).toBeGreaterThanOrEqual(1);
      expect(topic.competencies?.length).toBeGreaterThanOrEqual(2);
      expect(topic.sourceLabel && topic.sourceLabel in SOURCE_LABELS).toBe(true);
      expect(topic.sourceNote).toMatch(/https:\/\//);
      expect(topic.rubricReview?.status === "pending" || topic.rubricReview?.status === "reviewed").toBe(
        true,
      );
      if (topic.rubricReview?.status === "reviewed") {
        expect(topic.rubricReview.reviewer.trim().length).toBeGreaterThan(0);
      }
    },
  );

  it.each(coaches.map((topic) => [topic.id, topic] as const))(
    "%s lists the parts of its question and two skills with four distinct levels",
    (_id, topic) => {
      const parts = topic.parts ?? [];
      expect(parts.length).toBeGreaterThanOrEqual(2);
      expect(new Set(parts.map(normalize)).size).toBe(parts.length);

      const skills = topic.skills ?? [];
      expect(skills).toHaveLength(2);
      expect(new Set(skills.map((s) => normalize(s.name))).size).toBe(2);
      for (const skill of skills) {
        expect(skill.levels).toHaveLength(4);
        expect(new Set(skill.levels.map(normalize)).size).toBe(4);
      }
    },
  );

  it.each(coaches.map((topic) => [topic.id, topic] as const))(
    "%s has a twin that shares claims and differs in scenario",
    (_id, topic) => {
      expect(topic.twinIds?.length).toBeGreaterThanOrEqual(1);
      const twinId = topic.twinIds?.[0];
      const twin = twinId ? byId.get(twinId) : undefined;
      expect(twin, `${topic.id} twin ${twinId}`).toBeDefined();
      if (!twin) return;

      expect(twin.twinIds).toContain(topic.id);
      expect(twin.title).not.toBe(topic.title);
      expect(normalize(twin.framing)).not.toBe(normalize(topic.framing));

      const mine = new Set(topic.scaffold.keyPoints);
      const theirs = new Set(twin.scaffold.keyPoints);
      const shared = [...mine].filter((line) => theirs.has(line));
      expect(shared.length).toBeGreaterThanOrEqual(2);

      const onlyMine = [...mine].filter((line) => !theirs.has(line));
      expect(onlyMine.length).toBeGreaterThanOrEqual(3);

      const sharedTags = (topic.competencies ?? []).filter((tag) => twin.competencies?.includes(tag));
      expect(sharedTags.length).toBeGreaterThanOrEqual(1);
    },
  );
});
