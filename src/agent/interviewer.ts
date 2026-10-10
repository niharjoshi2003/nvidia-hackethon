/**
 * The interviewer agent: three named tools, each logged with its reason.
 *
 * Bounds, enforced here rather than promised in a prompt:
 *  - it chooses questions and follow-ups; it cannot write rubrics or grade,
 *  - every tool result is validated, and a failed or invalid result hands over
 *    to a fixed rule (oldest open miss first), so a session never stalls,
 *  - every call leaves one short trace line the UI shows as is.
 *
 * The policy is injectable. The shipped policy is rule-based; a model-backed
 * policy plugs in behind the same interface and the same validation.
 */

import {
  ROLE_LABELS,
  rubricLines,
  type InterviewerTool,
  type RoleTrack,
  type SpokenMiss,
  type Topic,
  type TraceEntry,
} from "@/types";

export interface InterviewContext {
  role: RoleTrack;
  /** The coach catalog. Choices outside it are rejected. */
  topics: Topic[];
  misses: SpokenMiss[];
  askedTopicIds: string[];
}

export interface QuestionChoice {
  topicId: string;
  reason: string;
}

export interface FollowUpChoice {
  topicId: string;
  /** What the interviewer says. */
  question: string;
  /** The rubric line the follow-up is aimed at, if any. */
  targetLine: string | null;
  reason: string;
}

export interface InterviewerPolicy {
  pickNextQuestion(ctx: InterviewContext): QuestionChoice | Promise<QuestionChoice>;
  getRubric(topicId: string, ctx: InterviewContext): string[] | Promise<string[]>;
  pickFollowUp(
    ctx: InterviewContext,
    lastTopicId: string,
    headlineLine: string | null,
  ): FollowUpChoice | Promise<FollowUpChoice>;
}

// --- helpers ----------------------------------------------------------------

const byOldest = (a: SpokenMiss, b: SpokenMiss) =>
  new Date(a.at).getTime() - new Date(b.at).getTime();

function shortLine(line: string, words = 8): string {
  const parts = line.split(/\s+/);
  return parts.length <= words ? line : `${parts.slice(0, words).join(" ")}…`;
}

function forRole(ctx: InterviewContext): Topic[] {
  const role = ctx.topics.filter((t) => t.roles?.includes(ctx.role));
  return role.length > 0 ? role : ctx.topics;
}

function unasked(ctx: InterviewContext, topics: Topic[]): Topic[] {
  return topics.filter((t) => !ctx.askedTopicIds.includes(t.id));
}

function openInCatalog(ctx: InterviewContext): SpokenMiss[] {
  const lines = new Set(ctx.topics.flatMap((t) => t.scaffold.keyPoints));
  return ctx.misses.filter((m) => m.status === "open" && lines.has(m.rubricLine)).sort(byOldest);
}

/** A question other than `excludeId` that grades `line`, preferring the role and unasked. */
function questionTesting(
  ctx: InterviewContext,
  line: string,
  excludeId: string | null,
): Topic | undefined {
  const tests = (t: Topic) => t.id !== excludeId && t.scaffold.keyPoints.includes(line);
  return (
    unasked(ctx, forRole(ctx)).find(tests) ??
    unasked(ctx, ctx.topics).find(tests) ??
    ctx.topics.find(tests)
  );
}

function firstFresh(ctx: InterviewContext, excludeId: string | null = null): Topic | undefined {
  const notThis = (t: Topic) => t.id !== excludeId;
  return (
    unasked(ctx, forRole(ctx)).find(notThis) ??
    unasked(ctx, ctx.topics).find(notThis) ??
    ctx.topics.find(notThis)
  );
}

// --- the fixed rule ---------------------------------------------------------

/**
 * Oldest open miss first. Used whenever a tool fails or returns something
 * invalid. Deliberately simple: it has to be obviously correct.
 */
export const fallbackRule = {
  pickNextQuestion(ctx: InterviewContext): QuestionChoice {
    const oldest = openInCatalog(ctx)[0];
    const topic = oldest ? questionTesting(ctx, oldest.rubricLine, oldest.topicId) : undefined;
    if (oldest && topic) {
      return { topicId: topic.id, reason: `Oldest open miss: "${shortLine(oldest.rubricLine)}"` };
    }
    const fresh = firstFresh(ctx);
    if (!fresh) throw new Error("the coach catalog is empty");
    return { topicId: fresh.id, reason: `First unasked ${ROLE_LABELS[ctx.role]} question` };
  },

  getRubric(topicId: string, ctx: InterviewContext): string[] {
    const topic = ctx.topics.find((t) => t.id === topicId);
    return topic ? rubricLines(topic) : [];
  },

  pickFollowUp(
    ctx: InterviewContext,
    lastTopicId: string,
    headlineLine: string | null,
  ): FollowUpChoice {
    const target = headlineLine ?? openInCatalog(ctx)[0]?.rubricLine ?? null;
    const topic = (target && questionTesting(ctx, target, lastTopicId)) || firstFresh(ctx, lastTopicId);
    if (!topic) throw new Error("no follow-up question available");
    return {
      topicId: topic.id,
      question: topic.framing,
      targetLine: target && topic.scaffold.keyPoints.includes(target) ? target : null,
      reason: target ? `Oldest open miss: "${shortLine(target)}"` : "Next unasked question",
    };
  },
};

// --- the shipped policy -----------------------------------------------------

/**
 * Rule-based policy with readable reasons. Prefers the line missed most
 * often, and always reaches for a twin rather than the same question.
 */
export const plannedPolicy: InterviewerPolicy = {
  pickNextQuestion(ctx) {
    const open = openInCatalog(ctx);
    const count = (line: string) => ctx.misses.filter((m) => m.rubricLine === line).length;
    const ranked = [...new Set(open.map((m) => m.rubricLine))].sort((a, b) => count(b) - count(a));

    for (const line of ranked) {
      const owner = open.find((m) => m.rubricLine === line)?.topicId ?? null;
      const topic = questionTesting(ctx, line, owner);
      if (!topic) continue;
      const n = count(line);
      return {
        topicId: topic.id,
        reason: `Picked "${topic.title}": "${shortLine(line)}" has been missed ${n === 1 ? "once" : `${n} times`}.`,
      };
    }

    const fresh = firstFresh(ctx);
    if (!fresh) throw new Error("the coach catalog is empty");
    return {
      topicId: fresh.id,
      reason: `Opening with "${fresh.title}" for the ${ROLE_LABELS[ctx.role]} track; no open misses yet.`,
    };
  },

  getRubric(topicId, ctx) {
    return fallbackRule.getRubric(topicId, ctx);
  },

  pickFollowUp(ctx, lastTopicId, headlineLine) {
    const last = ctx.topics.find((t) => t.id === lastTopicId);
    if (headlineLine) {
      const twin = questionTesting(ctx, headlineLine, lastTopicId);
      if (twin) {
        return {
          topicId: twin.id,
          question: twin.framing,
          targetLine: headlineLine,
          reason: `Picked "${twin.title}": it tests "${shortLine(headlineLine)}" in a different scenario.`,
        };
      }
    }
    const twinId = last?.twinIds?.find((id) => ctx.topics.some((t) => t.id === id));
    const twin = twinId ? ctx.topics.find((t) => t.id === twinId) : undefined;
    if (twin) {
      return {
        topicId: twin.id,
        question: twin.framing,
        targetLine: null,
        reason: `No agreed miss to chase, so trying the twin "${twin.title}".`,
      };
    }
    return fallbackRule.pickFollowUp(ctx, lastTopicId, headlineLine);
  },
};

// --- tool runner ------------------------------------------------------------

export class Interviewer {
  readonly trace: TraceEntry[] = [];

  constructor(
    private readonly policy: InterviewerPolicy = plannedPolicy,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async pickNextQuestion(ctx: InterviewContext): Promise<QuestionChoice> {
    return this.run(
      "pickNextQuestion",
      () => this.policy.pickNextQuestion(ctx),
      (c) => ctx.topics.some((t) => t.id === c.topicId),
      () => fallbackRule.pickNextQuestion(ctx),
      (c) => c.reason,
    );
  }

  async getRubric(topicId: string, ctx: InterviewContext): Promise<string[]> {
    const topic = ctx.topics.find((t) => t.id === topicId);
    return this.run(
      "getRubric",
      () => this.policy.getRubric(topicId, ctx),
      (lines) => lines.length > 0 && (topic ? lines.every((l) => rubricLines(topic).includes(l)) : false),
      () => fallbackRule.getRubric(topicId, ctx),
      (lines) => `Loaded ${lines.length} rubric lines for "${topic?.title ?? topicId}".`,
    );
  }

  async pickFollowUp(
    ctx: InterviewContext,
    lastTopicId: string,
    headlineLine: string | null,
  ): Promise<FollowUpChoice> {
    return this.run(
      "pickFollowUp",
      () => this.policy.pickFollowUp(ctx, lastTopicId, headlineLine),
      (c) =>
        c.topicId !== lastTopicId &&
        c.question.trim().length > 0 &&
        ctx.topics.some((t) => t.id === c.topicId),
      () => fallbackRule.pickFollowUp(ctx, lastTopicId, headlineLine),
      (c) => c.reason,
    );
  }

  private async run<T>(
    tool: InterviewerTool,
    attempt: () => T | Promise<T>,
    valid: (value: T) => boolean,
    fallback: () => T,
    describe: (value: T) => string,
  ): Promise<T> {
    let failure: string;
    try {
      const value = await attempt();
      if (valid(value)) {
        this.log(tool, true, false, describe(value));
        return value;
      }
      failure = "returned an invalid result";
    } catch (error) {
      failure = `failed (${error instanceof Error ? error.message : String(error)})`;
    }
    const value = fallback();
    this.log(tool, false, true, `${tool} ${failure}; fixed rule took over. ${describe(value)}`);
    return value;
  }

  private log(tool: InterviewerTool, ok: boolean, fallback: boolean, reason: string) {
    this.trace.push({ at: this.now().toISOString(), tool, ok, fallback, reason });
  }
}
