import type { Topic } from "@/types";
import { SHARED_CLAIMS as C } from "./sharedClaims";

/**
 * Six more coach questions, written as three twin pairs, so the interview
 * threads cover seven areas: RAG, agents, evaluation, cost and latency,
 * prompt-injection safety and extraction, model adaptation, and LLM operations.
 *
 *   injection defence   <->  document extraction pipeline
 *   prompt/RAG/fine-tune <->  swap a large model for a small tuned one
 *   observability       <->  release gate for prompt changes
 *
 * The rubric rules are the ones at the top of agentic.ts. Every source note says
 * what the source actually contains, and none claims a named company asked this
 * wording. rubricReview stays pending until a second person has read each line.
 */

const BANK =
  "https://github.com/ombharatiya/ai-system-design-guide/blob/main/00-interview-prep/01-question-bank.md";
const OWASP = "https://genai.owasp.org/llmrisk/llm01-prompt-injection/";
const OPENAI_OPTIMIZE = "https://platform.openai.com/docs/guides/optimizing-llm-accuracy";

const pending = { status: "pending" } as const;

export const interviewMoreTopics: Topic[] = [
  // --- injection defence ---------------------------------------------------------------
  {
    id: "llm-injection-defense",
    track: "agentic",
    roles: ["ai-engineer", "applied-ai"],
    competencies: ["prompt-injection", "untrusted-input", "least-privilege"],
    sourceLabel: "community",
    sourceNote: `Community. The question bank asks how to defend against prompt injection (Q47) and how to stop injection in a system that accepts user input (Q53). OWASP's LLM01 guidance lists the controls used in the rubric: constrain model behaviour, validate output formats, least privilege, human approval for high-risk actions, segregate untrusted content, and adversarial testing. The email-assistant scenario is ours. ${BANK} ${OWASP}`,
    twinIds: ["llm-extraction-pipeline"],
    rubricReview: pending,
    title: "Defend an email assistant against prompt injection",
    difficulty: "core",
    framing:
      "Your assistant reads a user's inbox, drafts replies, and looks up files. Someone sends it an email with hidden instructions. How do you design it so that does not work?",
    parts: [
      "Say how the assistant treats the text of an incoming email",
      "Say what limits the damage if an injection still gets through",
    ],
    skills: [
      {
        name: "Threat model",
        levels: [
          "Treats injection as a rare edge case or relies on the model noticing it",
          "Knows hidden instructions in an email can steer the model, with no design response",
          "Treats all email text as untrusted data and separates it from the system's instructions",
          "Treats email text as data, assumes some injections will land, and designs for that case",
        ],
      },
      {
        name: "Containment",
        levels: [
          "Adds a warning line to the prompt and considers the problem handled",
          "Mentions permissions or a human check without saying where they run",
          "Limits the assistant's permissions in code and asks a person before risky actions",
          "Limits permissions, checks every proposed action in code, and tests with adversarial emails",
        ],
      },
    ],
    interviewQuestions: [
      "What can the assistant do if an injection works, and who decided that?",
      "Where does the check on an outgoing action run?",
      "How would you know if a new prompt made injection easier?",
    ],
    modelAnswer: [
      "Incoming text is data for the model to read, and nothing in it can grant itself permission to act",
      "The model proposes an action and code decides whether that action is allowed to run",
      "Safety comes from several layers because no single defence stops every injection",
    ],
    scaffold: {
      keyPoints: [
        C.untrustedText,
        C.schemaChecked,
        "The assistant holds only the permissions this task needs, so an injected instruction cannot reach a tool the task never used",
        "A high-risk action such as sending a message or sharing a file waits for a person who sees the concrete action",
        "An instruction in the prompt telling the model to ignore injections is one layer and is never the only control",
        "Adversarial emails are replayed against every new version as a regression test, including hidden and encoded instructions",
      ],
      commonGotchas: [
        "Writing never follow instructions in emails in the system prompt and treating that as the defence",
        "Giving the assistant access to every file and every recipient because the task might need them",
        "Testing a few injections by hand at launch and never again after prompt changes",
      ],
      sixtySecondStructure: [
        "Say that email text is untrusted data, however it is phrased",
        "Limit what the assistant can touch to what the task needs",
        "Say which actions wait for a person and what they see",
        "Close on how you test it and how you know a change made it worse",
      ],
      followUps: [
        "What changes if the assistant can browse web pages as well?",
        "How would you handle an injection hidden in an image or an attachment?",
        "What do you log so an incident can be investigated afterwards?",
      ],
    },
    source: "seed",
  },
  {
    id: "llm-extraction-pipeline",
    track: "llm-core",
    roles: ["applied-ai"],
    competencies: ["untrusted-input", "output-validation", "human-in-the-loop"],
    sourceLabel: "community",
    sourceNote: `Community. The question bank's document processing scenario lists classification, extraction, a validation layer with schema and cross-field checks, confidence thresholds, and a human review queue with a feedback loop (Scenario 2). OWASP's LLM01 guidance covers segregating untrusted content and validating output formats. The invoice framing is ours, so it is a different question from the injection twin. ${BANK} ${OWASP}`,
    twinIds: ["llm-injection-defense"],
    rubricReview: pending,
    title: "Design a pipeline that turns uploaded invoices into database records",
    difficulty: "core",
    framing:
      "A finance team uploads about a hundred thousand invoices and forms a day. Design the pipeline that turns them into clean database records without a person reading every one.",
    parts: [
      "Walk through what happens to one document from upload to record",
      "Say how wrong or uncertain extractions are caught before they reach the database",
    ],
    skills: [
      {
        name: "Pipeline design",
        levels: [
          "Sends every document to one model and writes what comes back",
          "Names steps such as OCR and extraction, with no reason for the order",
          "Classifies the document first and routes it to the extraction method that suits its layout",
          "Routes by document type, explains why each stage exists, and treats text inside a document as data",
        ],
      },
      {
        name: "Quality control",
        levels: [
          "Trusts the model's output because the accuracy looked high in a demo",
          "Adds a human check on everything or on nothing, with no rule for choosing",
          "Validates the format and sends low-confidence records to a human review queue",
          "Validates format and meaning, routes by confidence, and feeds reviewer corrections back into the eval set",
        ],
      },
    ],
    interviewQuestions: [
      "How do you decide which records a person sees?",
      "What does a valid format check miss?",
      "What do you do with the corrections reviewers make?",
    ],
    modelAnswer: [
      "Every extraction passes a format check and a meaning check before it is written anywhere",
      "Uncertain records go to a person, and the pipeline does not guess to stay fast",
      "Reviewer corrections become labelled examples that show where the next version is weak",
    ],
    scaffold: {
      keyPoints: [
        C.untrustedText,
        C.schemaChecked,
        "Each document is classified by type first and routed to the extraction method that suits its layout",
        "A confidence threshold sends uncertain extractions to a human review queue instead of straight to the database",
        "Cross-field checks such as line items adding up to the total catch errors that a valid format cannot",
        "Reviewer corrections are saved as labelled examples so the next version is measured on the cases that failed",
      ],
      commonGotchas: [
        "Writing the model's JSON to the database because it matched the schema",
        "Sending every record to a person, which removes the point of automating it",
        "Letting text inside an uploaded document steer what the pipeline does with it",
      ],
      sixtySecondStructure: [
        "Follow one document: classify, extract, validate",
        "Say what the format check catches and what it cannot",
        "Say which records go to a person and how that is decided",
        "Close on how corrections improve the next version",
      ],
      followUps: [
        "How would you set the confidence threshold for a 99 percent accuracy target?",
        "What changes if the documents contain medical or personal data?",
        "How do you handle a document type you have never seen?",
      ],
    },
    source: "seed",
  },

  // --- prompting, retrieval, fine-tuning ---------------------------------------------------
  {
    id: "llm-adapt-technique",
    track: "llm-core",
    roles: ["ai-engineer"],
    competencies: ["fine-tuning", "rag-vs-finetune", "eval-baseline"],
    sourceLabel: "community",
    sourceNote: `Community. The question bank asks when to choose RAG over fine-tuning (Q2) and fine-tuning over prompt engineering (Q48). OpenAI's guide on optimizing LLM accuracy frames prompt engineering, retrieval, and fine-tuning as levers for different problems: context for missing knowledge, and model optimization for inconsistent behaviour, starting from an eval baseline. The law-firm framing is ours. ${BANK} ${OPENAI_OPTIMIZE}`,
    twinIds: ["llm-small-model-swap"],
    rubricReview: pending,
    title: "Choose between prompting, retrieval, and fine-tuning",
    difficulty: "core",
    framing:
      "A law firm wants an assistant that answers in its house style using its latest policy documents. Your first prototype gives mediocre answers and a colleague says just fine-tune it. How do you decide?",
    parts: [
      "Say how you decide which technique to try first",
      "Say what each technique fixes and what it does not",
    ],
    skills: [
      {
        name: "Decision method",
        levels: [
          "Picks the technique that sounds most advanced, usually fine-tuning",
          "Starts with prompting and moves up a ladder, with no way to tell when to move",
          "Measures a baseline, looks at the failures, and picks a technique to match them",
          "Diagnoses by failure type, picks one lever at a time, and re-measures against the same eval",
        ],
      },
      {
        name: "Technique fit",
        levels: [
          "Says each technique makes the model better, without saying how",
          "Knows retrieval adds documents and fine-tuning trains the model, with no limits on either",
          "Uses retrieval for knowledge and fine-tuning for behaviour, and says why",
          "Explains each fix and limit, when to combine them, and what training data must look like",
        ],
      },
    ],
    interviewQuestions: [
      "What would you look at in the failed answers before choosing?",
      "Why is fine-tuning a poor way to add last month's policies?",
      "When would you use retrieval and fine-tuning together?",
    ],
    modelAnswer: [
      "The three techniques fix different problems, so the failures decide which one to use",
      "Retrieval is for what the model does not know, and fine-tuning is for how it behaves",
      "A measured baseline comes first because without it nobody can say a change helped",
    ],
    scaffold: {
      keyPoints: [
        C.promptBaseline,
        C.failuresDecide,
        "Retrieval supplies knowledge that is new, proprietary or out of date because the model cannot learn it from the prompt alone",
        "Fine-tuning is chosen for inconsistent format, tone or reasoning, not to supply facts the model lacks or that keep changing",
        "Retrieval and fine-tuning are combined when evals show both a knowledge gap and a behaviour gap",
        "Fine-tuning examples must look like what the model sees in production, including retrieved context if the app uses it",
      ],
      commonGotchas: [
        "Fine-tuning to teach the model documents that change every month",
        "Treating prompting, retrieval and fine-tuning as a fixed ladder instead of different levers",
        "Training on clean hand-written examples that look nothing like real traffic",
      ],
      sixtySecondStructure: [
        "Say you measure a prompt-only baseline first",
        "Sort the failures: missing facts or inconsistent behaviour",
        "Match the lever to the failure and say what it will not fix",
        "Close on when you would combine them and how you re-measure",
      ],
      followUps: [
        "How many labelled examples do you want before you start?",
        "What would make you stop fine-tuning and go back to the prompt?",
        "How do you keep the fine-tuned model and the documents in sync?",
      ],
    },
    source: "seed",
  },
  {
    id: "llm-small-model-swap",
    track: "llm-core",
    roles: ["ai-engineer", "applied-ai"],
    competencies: ["fine-tuning", "eval-baseline", "cost-quality"],
    sourceLabel: "community",
    sourceNote: `Community. The question bank covers when to use a small language model and the cascading pattern that routes easy requests to a small model (Q19), and when fine-tuning beats prompt engineering on cost at volume (Q48). OpenAI's guide on optimizing LLM accuracy lists efficiency, the same accuracy for fewer tokens or with a smaller model, as a reason to fine-tune, and recommends a held-out set. The classification framing is ours. ${BANK} ${OPENAI_OPTIMIZE}`,
    twinIds: ["llm-adapt-technique"],
    rubricReview: pending,
    title: "Replace a large model with a smaller tuned one",
    difficulty: "advanced",
    framing:
      "A classification step calls a large model a million times a month and the bill is too high. Your lead wants to train a smaller model on your own logs instead. What do you do before agreeing, and how do you roll it out?",
    parts: [
      "Say what you do before agreeing to train anything, and how you build the training data",
      "Say how you roll the smaller model out without hurting users",
    ],
    skills: [
      {
        name: "Evidence first",
        levels: [
          "Agrees because a smaller model is obviously cheaper",
          "Wants to compare quality and cost, with no method for doing it",
          "Builds an eval from real traffic, measures a prompt-only baseline, and sorts the failures",
          "Does that, keeps a held-out set, and sets the quality bar the smaller model must meet before it ships",
        ],
      },
      {
        name: "Safe rollout",
        levels: [
          "Switches everything over at once and watches the bill",
          "Tests on a sample and then switches, with no way back",
          "Sends easy requests to the smaller model and keeps the large one for the rest",
          "Routes by difficulty, ramps traffic gradually, and keeps the large model ready as a fallback",
        ],
      },
    ],
    interviewQuestions: [
      "How do you know the smaller model is good enough?",
      "What would you do with the requests it is unsure about?",
      "What tells you after launch that it is hurting some users?",
    ],
    modelAnswer: [
      "The cheaper model ships only when it meets the quality bar on cases it has never seen",
      "Easy requests go to the small model and uncertain ones still reach the large one",
      "Traffic moves gradually, and the old path stays available until the new one proves itself",
    ],
    scaffold: {
      keyPoints: [
        C.promptBaseline,
        C.failuresDecide,
        C.qualityBar,
        "Training examples come from real logged inputs, are cleaned and checked, and a held-out set is kept back for evaluation",
        "A router sends easy requests to the smaller model and falls back to the large model when the smaller one is uncertain",
        "The smaller model takes a small share of traffic first and the large model stays ready to take it back if quality drops",
      ],
      commonGotchas: [
        "Judging the smaller model on the same examples it was trained on",
        "Assuming a lower price per call means a lower bill without checking quality and retries",
        "Switching all traffic at once with no way back to the old model",
      ],
      sixtySecondStructure: [
        "Say you measure a baseline and sort the failures before training",
        "Say where the training data comes from and what you hold back",
        "State the quality bar the smaller model must meet",
        "Close on routing, a gradual ramp, and the fallback",
      ],
      followUps: [
        "How many logged examples do you need and how do you clean them?",
        "How do you decide which requests are easy?",
        "What do you do when the large model is updated by its provider?",
      ],
    },
    source: "seed",
  },

  // --- observability and release gates ---------------------------------------------------
  {
    id: "llm-observability",
    track: "system-design",
    roles: ["ai-engineer", "applied-ai"],
    competencies: ["observability", "versioning", "production-quality"],
    sourceLabel: "community",
    sourceNote: `Community. The question bank asks how to implement observability for LLM applications (Q30) and how to version prompts in production (Q63). Its CI/CD answer lists the things that change in an LLM app: prompts, retrieved context, model versions, and parameters (Q31). The scenario is ours. ${BANK}`,
    twinIds: ["llm-release-gate"],
    rubricReview: pending,
    title: "Make an LLM feature debuggable in production",
    difficulty: "core",
    framing:
      "Your LLM feature has been live for a month. Users say it sometimes gives bad answers and nobody on the team can reproduce them. What do you put in place?",
    parts: [
      "Say what you record for every request",
      "Say how you tell whether quality is slipping",
    ],
    skills: [
      {
        name: "Traceability",
        levels: [
          "Would read the application logs or ask users for screenshots",
          "Logs the question and the answer, with no versions or context",
          "Logs the prompt version, model version, retrieved context and cost for each request",
          "Logs all of that, links user feedback to the trace, and redacts personal data",
        ],
      },
      {
        name: "Quality signals",
        levels: [
          "Watches uptime and error rate and assumes quality follows",
          "Reads complaints as they come in, with no regular measure",
          "Scores a sample of live traffic and watches the trend",
          "Scores live samples, links feedback, and alerts on movement in quality, cost and tail latency",
        ],
      },
    ],
    interviewQuestions: [
      "What would you need to reproduce one user's bad answer?",
      "Why do latency and error rate not show a wrong answer?",
      "What do you do about personal data in your logs?",
    ],
    modelAnswer: [
      "A bad answer is only debuggable if the version, the context and the cost were recorded with it",
      "Quality is measured on live traffic because uptime numbers cannot see a wrong answer",
      "Logs that hold user text are a privacy risk, so what is kept and for how long is a decision",
    ],
    scaffold: {
      keyPoints: [
        C.requestTrace,
        C.versionedChanges,
        "Quality is sampled continuously by scoring a slice of live traffic, because latency and error rates do not show a wrong answer",
        "User feedback such as a thumbs down or a retry is linked to the trace that produced it",
        "Logs that contain user text are redacted and kept for a limited time because traces can hold personal data",
        "Alerts watch movement in quality, cost and latency percentiles rather than averages alone",
      ],
      commonGotchas: [
        "Calling the feature healthy because average latency and error rate look normal",
        "Overwriting the prompt in place so nobody can tell which version produced an answer",
        "Keeping every user's full text forever because it might help with debugging one day",
      ],
      sixtySecondStructure: [
        "List what one request record must contain",
        "Say how you measure quality when nothing has crashed",
        "Say how a user complaint leads back to a trace",
        "Close on privacy and what you alert on",
      ],
      followUps: [
        "How would you score live answers without a human reading each one?",
        "What do you do when quality drops but nothing was deployed?",
        "How long would you keep traces and who can read them?",
      ],
    },
    source: "seed",
  },
  {
    id: "llm-release-gate",
    track: "swe",
    roles: ["ai-engineer"],
    competencies: ["versioning", "release-gate", "regression-eval"],
    sourceLabel: "community",
    sourceNote: `Community. The question bank's CI/CD answer for LLM applications lists prompt tests, an evaluation suite on a test set, cost estimation, prompt versioning with rollback, gradual rollout, and quality gates on faithfulness, latency and cost (Q31). It also asks how to version prompts in production (Q63). The scenario is ours, so it is a different question from the observability twin. ${BANK}`,
    twinIds: ["llm-observability"],
    rubricReview: pending,
    title: "Ship prompt changes safely with a release gate",
    difficulty: "core",
    framing:
      "Your team edits prompts several times a week and has twice broken production by accident. Design the process that stops a bad change reaching users.",
    parts: [
      "Say what a change must pass before it ships",
      "Say how you release it and how you recover if it still goes wrong",
    ],
    skills: [
      {
        name: "Gate design",
        levels: [
          "Asks a teammate to look at the new prompt and approve it",
          "Tries a few examples by hand before shipping, with no fixed set",
          "Runs every change against a frozen eval set and compares it with the current version",
          "Gates on quality, cost and latency together, and adds each production failure to the eval set",
        ],
      },
      {
        name: "Release and recovery",
        levels: [
          "Deploys to everyone and fixes problems as complaints arrive",
          "Keeps the old prompt somewhere in case it is needed",
          "Rolls out gradually and can revert to the previous version",
          "Ramps traffic in steps with monitoring, rolls back on a threshold, and traces regressions to a version",
        ],
      },
    ],
    interviewQuestions: [
      "What exactly is the new prompt compared against?",
      "How do you find which change caused a regression?",
      "How does a fixed bug stay fixed?",
    ],
    modelAnswer: [
      "A change is compared with the version in production on the same fixed set of cases",
      "Release is gradual and reversible, so a mistake reaches a few users and not all of them",
      "Every failure found in production becomes a test so it cannot return unnoticed",
    ],
    scaffold: {
      keyPoints: [
        C.requestTrace,
        C.versionedChanges,
        "A change ships only after it scores at least as well as the current version on the same frozen eval set",
        "The eval set grows with each production failure so a fixed bug cannot come back unnoticed",
        "Rollout is gradual, with quality watched at each step and an automatic rollback if a threshold is crossed",
        "Cost per query and tail latency are gates alongside quality so a better answer that is too slow does not ship",
      ],
      commonGotchas: [
        "Shipping because a few hand-picked examples looked better that morning",
        "Letting accuracy alone decide when the new version doubles the response time",
        "Fixing a production failure without adding it to the eval set",
      ],
      sixtySecondStructure: [
        "Say what the change is compared against and on which cases",
        "Name the gates: quality, cost, latency",
        "Describe the gradual rollout and the rollback trigger",
        "Close on how a fixed failure becomes a permanent test",
      ],
      followUps: [
        "How big does the eval set need to be before you trust the gate?",
        "What if the new prompt is better on average but worse for one customer?",
        "How do you handle a provider changing the model under you?",
      ],
    },
    source: "seed",
  },
];
