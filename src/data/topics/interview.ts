import type { Topic } from "@/types";
import { SHARED_CLAIMS as C } from "./sharedClaims";

/**
 * Coach questions for the AI Engineer and Applied AI Engineer tracks.
 *
 * Rubric rules are the ones at the top of agentic.ts. Each question has a
 * twin: a different framing that repeats the shared claims and adds its own.
 * Source labels say how strong the evidence is. They do not say a company
 * asked this wording.
 *
 * rubricReview stays pending until a second person has read every line.
 */

const BANK =
  "https://github.com/ombharatiya/ai-system-design-guide/blob/main/00-interview-prep/01-question-bank.md";

const OPENAI_APPLIED =
  "https://openai.com/careers/applied-ai-engineer-enterprise-san-francisco/";

const pending = { status: "pending" } as const;

export const interviewTopics: Topic[] = [
  {
    id: "rag-production-design",
    track: "llm-core",
    roles: ["ai-engineer"],
    competencies: ["retrieval-eval", "access-control", "rag-architecture"],
    sourceLabel: "community",
    sourceNote: `Community. The question bank asks candidates to walk through a production RAG architecture (Q1) and an enterprise search system with role-based access (Scenario 3). The wording here is ours, not a record of a question asked at a named company. ${BANK}`,
    twinIds: ["rag-contract-debug"],
    rubricReview: pending,
    title: "Design a production RAG system",
    difficulty: "core",
    framing:
      "Design a production RAG system for a company knowledge base. Walk through the architecture, and say where you would look if the answers were wrong.",
    parts: [
      "Walk through the architecture of the RAG system",
      "Say where you would look if the answers were wrong",
    ],
    skills: [
      {
        name: "Architecture",
        levels: [
          "Names RAG components without saying how they connect or why",
          "Describes an ingestion pipeline and a query pipeline, with no reasons for the choices",
          "Describes both pipelines and gives a reason for most choices, such as chunking or hybrid search",
          "Gives reasons and tradeoffs for each choice and places access control inside the retrieval query",
        ],
      },
      {
        name: "Debugging",
        levels: [
          "Would change the prompt or the model when answers are wrong",
          "Would read logs or look at retrieved chunks, with no method for deciding what failed",
          "Separates retrieval failures from generation failures",
          "Separates the two and says how each is measured, such as a retrieval-only set with labelled chunks",
        ],
      },
    ],
    interviewQuestions: [
      "How do you know the retriever is doing its job, separately from the model?",
      "Where does access control live, and what fails if you filter after retrieval?",
      "What do you measure in production that a demo would hide?",
    ],
    modelAnswer: [
      "A production design names the retrieval check and the generation check as two different measurements",
      "Permissions are a filter on the retrieval query, not a pass over the model's context afterwards",
      "The index, the reranker, and the generator each have a signal you can look at when an answer is wrong",
    ],
    scaffold: {
      keyPoints: [
        C.retrievalEval,
        C.accessControl,
        "Chunk boundaries follow the document structure so one fact is not split into pieces that never retrieve together",
        "Lexical and vector search both run because names and paraphrases fail in different ways",
        "A reranker narrows a short candidate list before generation so the model reads fewer irrelevant chunks",
        "Ingestion and query are logged as separate stages so a bad index is not mistaken for a bad prompt",
      ],
      commonGotchas: [
        "Filtering results after retrieval, which still loads chunks the caller is not allowed to see",
        "Reporting one accuracy number for the whole pipeline and then tuning the prompt",
        "Choosing a chunk size by token count alone and ignoring where facts actually sit",
      ],
      sixtySecondStructure: [
        "Start with the two pipelines: what is indexed, and what happens on a question",
        "Place access control inside the retrieval query",
        "Say how you would tell a retrieval failure from a generation failure",
        "Close on the signals you would watch after launch",
      ],
      followUps: [
        "What changes if two teams must never see each other's documents?",
        "When would you skip the reranker?",
        "How do you refresh the index when a policy document is replaced?",
      ],
    },
    source: "seed",
  },
  {
    id: "rag-contract-debug",
    track: "llm-core",
    roles: ["applied-ai"],
    competencies: ["retrieval-eval", "access-control", "rag-diagnosis"],
    sourceLabel: "community",
    sourceNote: `Community. The question bank separates retrieval metrics from generation metrics (Q5) and says access is filtered in the query, not after it (Q7). The contract-pilot framing is ours, so this is not the same question as the design twin. ${BANK}`,
    twinIds: ["rag-production-design"],
    rubricReview: pending,
    title: "Debug a RAG pilot that gives wrong answers on contracts",
    difficulty: "core",
    framing:
      "Your pilot is giving wrong answers on contracts. A lawyer asks how you would debug it before anyone trusts the tool.",
    parts: [
      "Say how you would find the cause of the wrong contract answers",
      "Say what has to be true before anyone trusts the tool",
    ],
    skills: [
      {
        name: "Diagnosis",
        levels: [
          "Proposes a fix, such as a new prompt or model, before finding the cause",
          "Looks at failed examples but does not separate search from generation",
          "First checks whether the right clause was retrieved, then splits the diagnosis on that answer",
          "Splits the diagnosis, measures each half, and gives a fix for each branch including abstention",
        ],
      },
      {
        name: "Trust",
        levels: [
          "Says answers would be checked more carefully, with no mechanism",
          "Adds citations or human review, with no reason given",
          "Cites the retrieved span and abstains when nothing relevant is found",
          "Cites and abstains, and keeps each client's contracts out of other clients' searches",
        ],
      },
    ],
    interviewQuestions: [
      "How do you tell a missing clause from a clause the model ignored?",
      "What do you do when search returns nothing useful?",
      "How do you stop one client seeing another client's contract?",
    ],
    modelAnswer: [
      "Debugging starts by asking whether the right clause was in the retrieved set",
      "A wrong answer with the right clause in context is a generation problem, not a search problem",
      "Empty retrieval ends in an abstention, and every clause shown was allowed for that user",
    ],
    scaffold: {
      keyPoints: [
        C.retrievalEval,
        C.accessControl,
        "The first check is whether the correct clause was present in the retrieved chunks at all",
        "If that clause was retrieved and the answer is still wrong, the failure is generation or context order",
        "The model abstains when retrieval returns nothing relevant instead of answering from its own memory",
        "A citation points at the retrieved span so a wrong contract answer can be traced to a specific chunk",
      ],
      commonGotchas: [
        "Rewriting the prompt when the clause was never retrieved",
        "Letting the model quote a contract from memory when the search came back empty",
        "Showing a clause from another client's contract because the filter ran after the search",
      ],
      sixtySecondStructure: [
        "Name the symptom: fluent answers that cite the wrong clause, or none",
        "Split the diagnosis: was the clause retrieved, or not",
        "Give one fix for each branch, including abstention",
        "Close on access: the filter is in the query, before any chunk is shown",
      ],
      followUps: [
        "How would you build a retrieval-only set from real contract questions?",
        "What do you log so the next wrong answer is faster to diagnose?",
        "When is a citation not enough to trust the answer?",
      ],
    },
    source: "seed",
  },
  {
    id: "agent-safe-tools",
    track: "agentic",
    roles: ["ai-engineer", "applied-ai"],
    competencies: ["idempotency", "bounded-retry", "tool-safety"],
    sourceLabel: "official",
    sourceNote: `Official. OpenAI's Applied AI Engineer posting says the role decides across agents, tools, safety, security, and governance. It does not quote this prompt. ${OPENAI_APPLIED}`,
    twinIds: ["agentic-tool-retries"],
    rubricReview: pending,
    title: "Design a safe tool-using agent",
    difficulty: "core",
    framing:
      "Design an agent that can look up orders, issue refunds, and send email. Which calls can it make on its own, and what stops a bad call?",
    parts: [
      "Say which calls the agent can make on its own",
      "Say what stops a bad call",
    ],
    skills: [
      {
        name: "Action boundaries",
        levels: [
          "Lets the agent call every tool, or none, with no distinction",
          "Separates read-only lookups from actions, with no reason",
          "Separates lookups from refunds and email, and puts the irreversible ones behind approval",
          "Draws the line by reversibility and reach, and says what the approver sees before agreeing",
        ],
      },
      {
        name: "Enforcement",
        levels: [
          "Relies on instructions in the prompt to stop bad calls",
          "Mentions validation or permissions without saying where they run",
          "Enforces permissions and the tool list in code outside the model",
          "Enforces limits in code and covers retries with the same idempotency key and bounded attempts",
        ],
      },
    ],
    interviewQuestions: [
      "Where does the permission check live?",
      "Which actions need a person, and what does that person actually see?",
      "What happens when a refund call times out?",
    ],
    modelAnswer: [
      "Safety is a property of the tool layer: permissions, approval, and a bound on retries",
      "The model proposes a call, and code decides whether that call is allowed to run",
      "A retried refund uses the same idempotency key as the first attempt",
    ],
    scaffold: {
      keyPoints: [
        C.idempotencyKey,
        C.boundedAttempts,
        "Each tool is limited to the permissions that task needs, and the limit is enforced outside the prompt",
        "An irreversible or wide-reaching action waits for approval that shows the concrete call and its arguments",
        "The model can call only tools the policy registered for this session, so a prompt cannot invent a new one",
        "A tool result is checked against its schema before the model is allowed to trust it",
      ],
      commonGotchas: [
        "Putting the safety check in the system prompt, where the model can be talked out of it",
        "Asking the model whether it feels confident enough to skip approval",
        "Generating a new idempotency key on every retry and charging the customer twice",
      ],
      sixtySecondStructure: [
        "Separate lookup, which can run alone, from refund and email, which cannot",
        "Put permissions and approval in the tool layer, not in the prompt",
        "Cover the timeout: same idempotency key, bounded attempts, surfaced failure",
        "Close on what the human is shown before they approve",
      ],
      followUps: [
        "What do you do if the approval times out?",
        "How do you test that the model cannot route around the gate?",
        "Who changes the policy when a new tool is added?",
      ],
    },
    source: "seed",
  },
  {
    id: "eval-llm-feature",
    track: "llm-core",
    roles: ["applied-ai"],
    competencies: ["frozen-eval", "judge-validation", "feature-eval"],
    sourceLabel: "official",
    sourceNote: `Official. OpenAI's Applied AI Engineer posting says the role evaluates systems with representative data, graders, production signals, and human judgment. It does not quote this prompt. ${OPENAI_APPLIED}`,
    twinIds: ["eval-agent-not-call"],
    rubricReview: pending,
    title: "How do you know your LLM feature works",
    difficulty: "core",
    framing:
      "You shipped an LLM feature to a pilot. How do you know it works, and how do you know a change made it better?",
    parts: [
      "Say how you know the feature works",
      "Say how you know a change made it better",
    ],
    skills: [
      {
        name: "Measurement",
        levels: [
          "Relies on demos, spot checks, or user feedback alone",
          "Mentions an eval set or metrics without saying how they are built or labelled",
          "Uses a labelled set of representative cases, frozen before versions are compared",
          "Uses a frozen representative set, reports human agreement first, and adds new failures to the set",
        ],
      },
      {
        name: "Deciding a change is better",
        levels: [
          "Calls a change better because a few outputs look better",
          "Compares a score before and after, with no check on the scorer",
          "Compares on the frozen set and checks any LLM judge against human labels",
          "Compares with a checked judge, and ships only when quality, cost, and latency all hold",
        ],
      },
    ],
    interviewQuestions: [
      "What has to be frozen before you compare two versions?",
      "When is an LLM judge allowed to count?",
      "What else besides quality has to hold before you ship the change?",
    ],
    modelAnswer: [
      "Two versions are comparable only on a frozen set that was labelled before the change",
      "The judge's number is reported next to how often humans agreed with it",
      "Better means the quality bar held without blowing the cost or the latency",
    ],
    scaffold: {
      keyPoints: [
        C.frozenSet,
        C.judgeAgreement,
        "The set includes representative production cases, not only the examples that already pass",
        "Human graders' agreement with each other is reported before any model's agreement is treated as a score",
        "A change ships only when quality, cost, and latency all stay inside the bar you set",
        "Failures found after launch are added to the set, or the set stops representing the product",
      ],
      commonGotchas: [
        "Trusting an LLM judge that has never been checked against a human",
        "Declaring improvement from a handful of examples you picked after seeing the output",
        "Measuring only the cases the feature already gets right",
      ],
      sixtySecondStructure: [
        "Name the unit of comparison: a frozen labelled set",
        "Say what the humans agreed on, then what the judge agreed with them on",
        "Put cost and latency on the same bar as quality",
        "Close on how new failures get into the set",
      ],
      followUps: [
        "How large a set do you need before a small gain is real?",
        "What do you do when the two human graders disagree?",
        "How do you stop the set leaking into the prompt?",
      ],
    },
    source: "seed",
  },
  {
    id: "eval-agent-not-call",
    track: "agentic",
    roles: ["ai-engineer"],
    competencies: ["frozen-eval", "judge-validation", "agent-eval"],
    sourceLabel: "official",
    sourceNote: `Official. The same Applied AI Engineer posting assesses agents and systematic evaluation with human judgment. The end-state check follows the question bank's open-ended evaluation item (Q27). The posting does not quote this prompt. ${OPENAI_APPLIED}`,
    twinIds: ["eval-llm-feature"],
    rubricReview: pending,
    title: "Evaluate an agent, not a single call",
    difficulty: "advanced",
    framing:
      "The agent can take many paths and call tools. How do you evaluate the agent, rather than one model response?",
    parts: [
      "Say what you check when many paths to the result are valid",
      "Say how evaluating the agent differs from evaluating one model response",
    ],
    skills: [
      {
        name: "Outcome checks",
        levels: [
          "Grades the final message only",
          "Checks whether the task looks done, with no defined end state",
          "Asserts the end state of the task and scores the actions in the trace",
          "Asserts the end state, scores the actions, and fails runs that exceed a bound on calls, cost, or time",
        ],
      },
      {
        name: "Trusting the grader",
        levels: [
          "Uses an LLM judge with no check on it",
          "Mentions human review without saying how it is used",
          "Checks the judge against human labels on a frozen set",
          "Reports the judge's agreement with humans, after the humans' agreement with each other",
        ],
      },
    ],
    interviewQuestions: [
      "What do you assert when many tool sequences would be valid?",
      "What in the trace matters besides the final message?",
      "When is a correct end state still a failed run?",
    ],
    modelAnswer: [
      "An agent eval checks the world after the run, not the wording of one completion",
      "The trace has to show the right actions, within a bound on calls, cost, and time",
      "The judge of that trace still needs a measured agreement with human labels",
    ],
    scaffold: {
      keyPoints: [
        C.frozenSet,
        C.judgeAgreement,
        "The check asserts the end state of the task, because many tool sequences can be valid",
        "The trace is scored for the actions taken, not only for the final message",
        "A run that reaches the right end state with unbounded tool calls is not a pass",
        "Cost and latency of the whole run sit beside task success in the result",
      ],
      commonGotchas: [
        "Grading the final paragraph and ignoring a tool call that did the wrong thing",
        "Treating a lucky single call as evidence the agent is reliable",
        "Counting a success that took forty retries the same as one that took three",
      ],
      sixtySecondStructure: [
        "Reframe: you are grading the task outcome, not one completion",
        "Say what the trace must show about the actions",
        "Put a bound on calls, cost, and time next to success",
        "Close on the judge still needing human agreement",
      ],
      followUps: [
        "How do you label an end state a script cannot check?",
        "What belongs in the trace and what is noise?",
        "How do you stop the agent memorising the eval tasks?",
      ],
    },
    source: "seed",
  },
  {
    id: "prod-cost-latency",
    track: "llm-core",
    roles: ["ai-engineer"],
    competencies: ["quality-bar", "cost-per-outcome", "latency"],
    sourceLabel: "official",
    sourceNote: `Official. OpenAI's Applied AI Engineer posting lists latency and cost among the decisions the role owns. The question bank's cost item (Q25) and latency item (Q49) are the community shape. The posting does not quote this prompt. ${OPENAI_APPLIED}`,
    twinIds: ["prod-defend-model"],
    rubricReview: pending,
    title: "Cut cost and latency of an LLM workflow",
    difficulty: "core",
    framing:
      "This workflow is too slow and too expensive to ship. Walk through how you would cut cost and latency without quietly making the answers worse.",
    parts: [
      "Say how you would cut latency",
      "Say how you would cut cost",
      "Say how you would keep the answers from getting worse",
    ],
    skills: [
      {
        name: "Optimisation",
        levels: [
          "Suggests a cheaper or faster model with no measurement",
          "Lists techniques such as caching, streaming, or smaller models, with no reasons",
          "Measures where time and money go first, then cuts the stage that is actually slow or expensive",
          "Measures first, routes easy requests to a smaller model that escalates on a failed check, and caches only where stale is acceptable",
        ],
      },
      {
        name: "Holding the quality bar",
        levels: [
          "Does not mention answer quality",
          "Says quality should be checked, with no method",
          "Runs every cheaper path against the same eval and quality bar",
          "Holds the quality bar and reports cost per successful outcome, not cost per call",
        ],
      },
    ],
    interviewQuestions: [
      "Which latency number are you actually cutting?",
      "When is a smaller model allowed to take the request?",
      "What cost number do you report to decide it worked?",
    ],
    modelAnswer: [
      "The first cut is the stage the latency breakdown says is slow, not the stage that is easiest to change",
      "A smaller model takes the easy requests only after it clears the same quality bar",
      "The number that matters is the cost of a successful outcome",
    ],
    scaffold: {
      keyPoints: [
        C.qualityBar,
        C.costPerOutcome,
        "Latency is split into time to first token and time to finish so you cut the stage that is actually slow",
        "Easy requests go to a smaller model, and a failed check is what escalates them",
        "A cached answer is returned only when a stale response is acceptable for that request",
        "Streaming shortens the wait a person feels and does not shorten the time until the answer is complete",
      ],
      commonGotchas: [
        "Swapping in a cheaper model because the price list is lower, with no eval on your task",
        "Caching answers to questions where yesterday's answer is wrong today",
        "Reporting a lower bill per call while users need more calls to finish the task",
      ],
      sixtySecondStructure: [
        "Split latency into first token and full answer, and say which one hurts",
        "Name the quality bar a cheaper path still has to clear",
        "Cover caching only where stale is acceptable",
        "Close on cost per successful outcome, not cost per call",
      ],
      followUps: [
        "What check sends a request back up to the larger model?",
        "How do you know streaming helped the person and not just the chart?",
        "Where would you refuse to cache?",
      ],
    },
    source: "seed",
  },
  {
    id: "prod-defend-model",
    track: "llm-core",
    roles: ["applied-ai"],
    competencies: ["quality-bar", "cost-per-outcome", "model-choice"],
    sourceLabel: "official",
    sourceNote: `Official. OpenAI's Applied AI Engineer posting says the role makes sound decisions across models, on the evidence of evaluation rather than a demo. The question bank's model-choice item (Q18) is the community shape. This is not a claim that a company asked for a project deep dive in these words. ${OPENAI_APPLIED}`,
    twinIds: ["prod-cost-latency"],
    rubricReview: pending,
    title: "Defend your model choice",
    difficulty: "core",
    framing:
      "In a project review you chose one model over two others. Defend that choice. What would make you switch?",
    parts: [
      "Defend the model you chose over the other two",
      "Say what would make you switch",
    ],
    skills: [
      {
        name: "Evidence",
        levels: [
          "Defends the choice with familiarity or reputation",
          "Cites a public benchmark or leaderboard",
          "Cites results on the team's own task eval, including cost",
          "Cites the task eval and the constraint this model met that the others did not, and names where it fails",
        ],
      },
      {
        name: "Conditions for switching",
        levels: [
          "Would not switch, or gives no condition",
          "Would switch to a better model, with no definition of better",
          "Names a concrete condition, such as price or a missed quality bar",
          "Names the condition, what it would switch to, and how the comparison would be rerun",
        ],
      },
    ],
    interviewQuestions: [
      "What constraint did this model meet that the next one did not?",
      "What evidence is yours, and what is just a public leaderboard?",
      "Where does the model you chose fail?",
    ],
    modelAnswer: [
      "The choice is the model that cleared the quality bar at an acceptable cost on your eval",
      "A leaderboard is context, and the decision rests on the labelled task set",
      "The answer includes the condition under which you would pick a different model",
    ],
    scaffold: {
      keyPoints: [
        C.qualityBar,
        C.costPerOutcome,
        "The reason names the task constraint that this model met and the next one you tried did not",
        "The evidence is your task eval, not a public leaderboard score",
        "You can say what you would switch to if that constraint changed",
        "The failure mode of the chosen model is named, not only the reason it won",
      ],
      commonGotchas: [
        "Defending the choice with a benchmark that does not match the task",
        "Naming a vendor because it is familiar and skipping the comparison",
        "Describing the winner and having nothing to say about where it fails",
      ],
      sixtySecondStructure: [
        "State the constraint the task actually had",
        "Show the comparison on your eval, including cost per success",
        "Name where the chosen model fails",
        "Close on the condition that would make you switch",
      ],
      followUps: [
        "What did you try and reject, and why?",
        "How often would you rerun that comparison?",
        "What would you do if the winner's price doubled?",
      ],
    },
    source: "seed",
  },
];
