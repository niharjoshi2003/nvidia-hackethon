import type { Topic } from "@/types";
import { SHARED_CLAIMS } from "./sharedClaims";

/**
 * Rubric authoring rules, applied to every topic in this file:
 *
 *  - A key point is a single checkable claim, not a subject area. "Bound retry
 *    attempts and surface a terminal failure" can be judged present or absent;
 *    "discuss error handling" cannot.
 *  - Each line must be quotable as-is. The evaluator has to copy it verbatim,
 *    so a line that reads awkwardly in isolation produces an awkward miss.
 *  - Gotchas describe a wrong move, so the evaluator can name it when heard.
 *
 * A vague line here becomes a vague miss on screen, which is the one failure
 * mode the whole project is built to avoid.
 */
export const agenticTopics: Topic[] = [
  {
    id: "agentic-tool-retries",
    track: "agentic",
    roles: ["ai-engineer", "applied-ai"],
    competencies: ["idempotency", "bounded-retry"],
    sourceLabel: "community",
    sourceNote:
      "Community. The question bank's tool-use item says tools should be idempotent where possible (Q13, https://github.com/ombharatiya/ai-system-design-guide/blob/main/00-interview-prep/01-question-bank.md). This timeout scenario is the app's existing seed question, not a prompt from a company interview guide.",
    twinIds: ["agent-safe-tools"],
    rubricReview: { status: "pending" },
    title: "Retrying tool calls without repeating side effects",
    difficulty: "core",
    framing:
      "Your agent calls a payments API. The call times out. Walk me through what happens next.",
    parts: [
      "Say what the agent does right after the payment call times out",
      "Say how a retry avoids charging the customer twice",
    ],
    skills: [
      {
        name: "Retry safety",
        levels: [
          "Retries the call immediately, assuming the timeout means it failed",
          "Says the payment might have gone through, with no way to check or guard against it",
          "Retries with the same idempotency key so a repeat returns the original result",
          "Uses the same key, says where it is stored and what a replay returns, and separates retriable errors from terminal ones",
        ],
      },
      {
        name: "Failure handling",
        levels: [
          "Retries until the call works",
          "Limits retries, with no backoff and no reason for the limit",
          "Bounds attempts in code with backoff and surfaces a final failure",
          "Bounds attempts with jittered backoff enforced in code, not by the model, and reports what state the payment is in",
        ],
      },
    ],
    interviewQuestions: [
      "How do you retry a tool call that may have already succeeded?",
      "What makes a tool safe for an agent to call twice?",
      "How would you stop a retry loop from double-charging a customer?",
    ],
    modelAnswer: [
      "A timeout is ambiguous: the write may have succeeded, so the retry must be safe before it is attempted",
      "An idempotency key generated once per logical operation makes the replay return the original result instead of repeating it",
      "Retriable errors like 5xx and timeouts are separated from terminal ones like 4xx validation failures",
      "Attempts are bounded and the agent surfaces a terminal failure rather than looping",
    ],
    scaffold: {
      keyPoints: [
        "A timeout is ambiguous, so the agent cannot assume the write failed",
        SHARED_CLAIMS.idempotencyKey,
        "The idempotency key is stored with the result so a replay returns the original response",
        "Exponential backoff with jitter prevents synchronized retry storms across agents",
        "Retriable errors must be distinguished from terminal ones before any retry",
        SHARED_CLAIMS.boundedAttempts,
      ],
      commonGotchas: [
        "Generating a fresh idempotency key on each retry, which defeats the mechanism entirely",
        "Treating a timeout as a definite failure and re-issuing an unguarded write",
        "Letting the model itself decide whether to retry, so the bound is not enforced in code",
      ],
      sixtySecondStructure: [
        "Name the ambiguity: a timeout does not tell you whether the write landed",
        "Give the mechanism: an idempotency key held constant across attempts",
        "Say where the key lives and what a replay returns",
        "Close on the bound: retriable versus terminal, capped attempts, surfaced failure",
      ],
      followUps: [
        "Where do you store the idempotency key, and for how long?",
        "What if two different agents issue the same logical operation?",
        "How does this change if the tool is not under your control?",
      ],
    },
    source: "seed",
  },
  {
    id: "agentic-tool-schema-design",
    track: "agentic",
    title: "Designing a tool schema a model will actually use correctly",
    difficulty: "core",
    framing:
      "A model keeps calling your search tool with malformed arguments. How do you fix the tool rather than the prompt?",
    interviewQuestions: [
      "What makes a tool schema easy for a model to call correctly?",
      "How do you handle a tool that the model consistently misuses?",
      "How many tools is too many for one agent?",
    ],
    modelAnswer: [
      "The description is part of the interface: it states when to call the tool and when not to",
      "Fewer, wider parameters beat many narrow ones because each required field is another chance to hallucinate",
      "Enums and constrained types remove whole classes of invalid calls before they happen",
      "Validation errors are returned to the model as actionable text so it can correct itself",
    ],
    scaffold: {
      keyPoints: [
        "The tool description is prompt surface and must say when not to call it",
        "Constrained types like enums eliminate invalid arguments structurally rather than by instruction",
        "Validation failures should return an actionable message the model can act on, not a stack trace",
        "Overlapping tools cause selection errors, so merge tools that answer the same question",
        "Required parameters should be minimised because each one is a hallucination opportunity",
        "Tool output must be shaped for a model to read, not for a UI to render",
      ],
      commonGotchas: [
        "Fixing a misused tool by adding instructions to the system prompt instead of constraining the schema",
        "Returning raw API errors that give the model nothing to correct",
        "Exposing dozens of near-identical tools and blaming the model for picking wrong",
      ],
      sixtySecondStructure: [
        "Reframe: this is an interface design problem, not a prompting problem",
        "Give the structural fixes: constrained types, fewer required fields, no overlap",
        "Cover the feedback loop: what the model sees when it gets it wrong",
        "Close on tool output being written for a reader that is a model",
      ],
      followUps: [
        "How would you test that a schema change actually reduced bad calls?",
        "When would you split one tool into two?",
        "How do you version a tool schema that agents already depend on?",
      ],
    },
    source: "seed",
  },
  {
    id: "agentic-context-management",
    track: "agentic",
    title: "Keeping a long-running agent inside its context window",
    difficulty: "advanced",
    framing:
      "Your agent runs for forty tool calls. Around call twenty-five the quality collapses. What is happening and what do you do?",
    interviewQuestions: [
      "How do you manage context in a long agent run?",
      "What do you drop first when the window fills up?",
      "How do you know summarisation lost something important?",
    ],
    modelAnswer: [
      "Tool outputs dominate context growth, so they are the first thing to truncate or summarise",
      "The original objective must survive every compaction or the agent drifts from the task",
      "Summarisation is lossy and irreversible, so the raw trace is kept outside the window and can be retrieved",
      "Quality degrades before the window is full, because attention over a long context is not uniform",
    ],
    scaffold: {
      keyPoints: [
        "Tool outputs, not the conversation, are what actually fills a long agent run",
        "The original objective must be re-anchored after every compaction or the agent drifts",
        "Summarisation is lossy and irreversible, so the raw trace belongs in external storage",
        "Retrieval on demand beats carrying everything, because the agent can fetch what it needs",
        "Quality degrades well before the window is technically full",
        "Failed attempts should be compacted into a short lesson rather than dropped or kept whole",
      ],
      commonGotchas: [
        "Summarising the transcript but losing the original objective, so the agent finishes the wrong task",
        "Assuming the failure starts only when the window overflows",
        "Discarding failed attempts entirely, so the agent repeats them",
      ],
      sixtySecondStructure: [
        "Diagnose first: tool outputs are the growth, and degradation starts before overflow",
        "Give the strategy: compact tool results, keep the raw trace retrievable",
        "Cover the invariant: the objective is re-anchored every time",
        "Close on failed attempts becoming lessons, not noise",
      ],
      followUps: [
        "How would you detect drift automatically?",
        "What belongs in a summary of a failed attempt?",
        "Would you use a second model to compact? What does that cost you?",
      ],
    },
    source: "seed",
  },
  {
    id: "agentic-evaluation",
    track: "agentic",
    title: "Evaluating an agent when there is no single correct answer",
    difficulty: "advanced",
    framing:
      "How do you know a change to your agent made it better, when the task has many valid solutions?",
    interviewQuestions: [
      "How do you evaluate an agent whose output is open-ended?",
      "What is wrong with using an LLM as your only judge?",
      "How do you build an eval set that stays useful?",
    ],
    modelAnswer: [
      "Outcome checks that assert the end state beat output matching when many paths are valid",
      "A frozen eval set with human labels is the only thing that makes two runs comparable",
      "An LLM judge must itself be validated against human agreement before its scores mean anything",
      "Cost and latency are part of the evaluation because an agent that is better and ten times slower may not ship",
    ],
    scaffold: {
      keyPoints: [
        "Assert the end state rather than the exact output when many solution paths are valid",
        "A frozen, version-controlled eval set is what makes two runs comparable at all",
        "An LLM judge needs its own agreement number against human labels before its scores are usable",
        "Inter-rater agreement between humans is the ceiling on any judge's measurable accuracy",
        "Cost and latency belong in the evaluation alongside quality",
        "Failure cases must be added to the eval set as they are found, or the set decays",
      ],
      commonGotchas: [
        "Trusting an LLM judge without ever checking it against a human",
        "Reporting a percentage from a sample too small to support it",
        "Evaluating only on cases the agent already passes, so regressions go unseen",
      ],
      sixtySecondStructure: [
        "Start with the reframe: check the end state, not the transcript",
        "Establish the frozen labelled set as the unit of comparison",
        "Address the judge: it needs its own validation and a human ceiling",
        "Close on cost and latency being part of better",
      ],
      followUps: [
        "How large does an eval set need to be before you trust a five point difference?",
        "How do you stop the eval set leaking into your prompt tuning?",
        "What do you do when humans disagree with each other?",
      ],
    },
    source: "seed",
  },
  {
    id: "agentic-human-in-the-loop",
    track: "agentic",
    title: "Deciding where an agent must stop and ask a human",
    difficulty: "core",
    framing:
      "Your agent can send emails, issue refunds, and delete records. Which of those needs approval, and how do you decide?",
    interviewQuestions: [
      "Where do you put a human in an agent loop?",
      "How do you avoid approval fatigue?",
      "What makes an action safe to automate?",
    ],
    modelAnswer: [
      "Reversibility and blast radius, not the model's confidence, decide what needs approval",
      "The approval must show what will happen in concrete terms, not ask the human to trust a summary",
      "Too many low-value approvals train the human to approve without reading, which is worse than no gate",
      "The gate belongs in the tool layer so the model cannot route around it",
    ],
    scaffold: {
      keyPoints: [
        "Reversibility and blast radius decide what needs approval, not the model's stated confidence",
        "The approval prompt must show the concrete action and its arguments, not a summary",
        "Excessive low-value approvals cause rubber-stamping, which is worse than having no gate",
        "The gate is enforced in the tool layer so the model cannot route around it",
        "Every approved and rejected action is logged for audit and for improving the policy",
        "A rejection must be fed back to the agent as a reason so it can choose differently",
      ],
      commonGotchas: [
        "Gating on model confidence, which is not calibrated against real-world consequence",
        "Putting the check in the prompt, where a sufficiently determined model will bypass it",
        "Asking for approval so often that the human stops reading the requests",
      ],
      sixtySecondStructure: [
        "Give the decision rule first: reversibility and blast radius",
        "Say where the gate lives, and why the prompt is the wrong place",
        "Cover the human factor: rubber-stamping as a real failure mode",
        "Close on the feedback loop and the audit trail",
      ],
      followUps: [
        "How would you make an irreversible action reversible instead of gating it?",
        "Who owns the approval policy as the agent's tools grow?",
        "How do you handle an approval that times out?",
      ],
    },
    source: "seed",
  },
];
