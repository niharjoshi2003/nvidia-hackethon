import type { Topic } from "@/types";

export const llmCoreTopics: Topic[] = [
  {
    id: "llm-rag-retrieval-quality",
    track: "llm-core",
    title: "Diagnosing a RAG system that returns confident wrong answers",
    difficulty: "core",
    framing:
      "Your RAG pipeline answers fluently but gets facts wrong. Where do you look first?",
    interviewQuestions: [
      "How do you tell a retrieval problem from a generation problem?",
      "What do you measure in a RAG pipeline?",
      "How do you stop the model answering when retrieval found nothing useful?",
    ],
    modelAnswer: [
      "Retrieval and generation must be measured separately, because the fix is completely different",
      "Retrieval is checked first by asking whether the answer was present in the retrieved chunks at all",
      "If the evidence was retrieved and the answer is still wrong, the failure is in generation or in how context was ordered",
      "The model must be able to abstain when retrieval returns nothing relevant, rather than answering from parametric memory",
    ],
    scaffold: {
      keyPoints: [
        "Retrieval and generation must be measured separately because their fixes are unrelated",
        "The first check is whether the correct answer was present in the retrieved chunks at all",
        "If the evidence was retrieved and the answer is still wrong, the failure is generation, not retrieval",
        "The model must be able to abstain when nothing relevant was retrieved",
        "Chunking strategy determines whether a complete answer can ever be retrieved in one piece",
        "Citations that point to retrieved spans make a wrong answer diagnosable instead of mysterious",
      ],
      commonGotchas: [
        "Tuning the prompt when the evidence was never retrieved in the first place",
        "Allowing the model to answer from parametric memory when retrieval came back empty",
        "Reporting one end-to-end accuracy number that hides which half is broken",
      ],
      sixtySecondStructure: [
        "Split the problem: retrieval versus generation, measured separately",
        "Give the diagnostic: was the answer in the retrieved chunks?",
        "Branch on the answer, one fix each",
        "Close on abstention and citations as the safety net",
      ],
      followUps: [
        "How would you build a retrieval-only eval set?",
        "When does reranking help and when is it wasted?",
        "How do you chunk a document where answers span sections?",
      ],
    },
    source: "seed",
  },
  {
    id: "llm-structured-output",
    track: "llm-core",
    title: "Getting reliable structured output out of a model",
    difficulty: "foundational",
    framing:
      "You need JSON from a model to feed a downstream system. How do you make that reliable?",
    interviewQuestions: [
      "How do you guarantee valid JSON from an LLM?",
      "What do you do when the schema validates but the content is wrong?",
      "How does constrained decoding differ from asking nicely?",
    ],
    modelAnswer: [
      "Constrained decoding enforces the shape during generation, which is stronger than instructing and retrying",
      "Schema validation catches shape errors but says nothing about whether the values are correct",
      "Validation must be paired with semantic checks that test the values against the source material",
      "A validation failure needs a bounded retry with the error fed back, not an unbounded loop",
    ],
    scaffold: {
      keyPoints: [
        "Constrained decoding enforces shape during generation and is stronger than instruct-and-retry",
        "A schema validates shape only and tells you nothing about whether values are correct",
        "Semantic checks must test values against the source, not just against the type",
        "A validation failure needs a bounded retry with the specific error fed back",
        "Temperature zero improves determinism but does not guarantee identical output",
        "Enums and closed sets are more reliable than free text wherever the domain allows",
      ],
      commonGotchas: [
        "Treating a passing schema check as evidence the content is right",
        "Retrying without telling the model what was wrong",
        "Using free-text fields where a closed set would do, then parsing the text later",
      ],
      sixtySecondStructure: [
        "Distinguish enforcing the shape from asking for it",
        "State clearly that shape validity is not correctness",
        "Give the semantic check against the source",
        "Close on bounded retries with the error fed back",
      ],
      followUps: [
        "What do you do if the model cannot produce a valid answer at all?",
        "How would you detect a silently degraded field over time?",
        "When is free text genuinely the right choice?",
      ],
    },
    source: "seed",
  },
  {
    id: "llm-judge-validation",
    track: "llm-core",
    title: "Using a model as a judge without fooling yourself",
    difficulty: "advanced",
    framing:
      "You want to score thousands of outputs with an LLM judge. How do you know the judge is any good?",
    interviewQuestions: [
      "How do you validate an LLM judge?",
      "What biases does an LLM judge have?",
      "What is the ceiling on a judge's accuracy?",
    ],
    modelAnswer: [
      "The judge must be scored against human labels before any of its numbers are used",
      "Human inter-rater agreement is the ceiling, because the judge cannot beat the label quality it is measured against",
      "LLM judges favour longer and more confident answers, and favour outputs from their own model family",
      "Forcing the judge to cite the span it is judging makes its scores auditable rather than asserted",
    ],
    scaffold: {
      keyPoints: [
        "The judge must be scored against human labels before its numbers are used for anything",
        "Human inter-rater agreement is the ceiling on measurable judge accuracy",
        "LLM judges show length bias, favouring longer and more confident-sounding answers",
        "Judges favour outputs from their own model family, so self-evaluation is not neutral",
        "Requiring the judge to cite the span it judged makes the score auditable",
        "Position bias in pairwise comparison requires swapping the order and averaging",
      ],
      commonGotchas: [
        "Reporting judge scores without ever establishing agreement with a human",
        "Using the same model to generate and to judge and calling it an evaluation",
        "Comparing two options in a fixed order, so position bias contaminates every result",
      ],
      sixtySecondStructure: [
        "Lead with validation: the judge needs its own accuracy number",
        "Name the ceiling: human agreement with itself",
        "List the specific biases: length, family, position",
        "Close on citation as the mechanism that makes scores auditable",
      ],
      followUps: [
        "How many human labels do you need before you trust the agreement number?",
        "What would make you abandon an LLM judge entirely?",
        "How do you keep the judge stable when the underlying model updates?",
      ],
    },
    source: "seed",
  },
  {
    id: "llm-model-routing",
    track: "llm-core",
    title: "Routing between a small and a large model",
    difficulty: "core",
    framing:
      "You have a cheap fast model and an expensive strong one. How do you decide which handles a given request?",
    interviewQuestions: [
      "How would you split work between two model sizes?",
      "How do you prove the routing is worth the complexity?",
      "What happens when the small model is wrong and you do not notice?",
    ],
    modelAnswer: [
      "The split should follow the nature of the step: mechanical extraction for the small model, judgment for the large one",
      "The routing must be justified by an ablation showing the split beats either model alone on quality and cost",
      "A cascade that escalates on low confidence needs a confidence signal that is actually calibrated",
      "Routing adds latency and a failure mode, so it must earn its place with measured numbers",
    ],
    scaffold: {
      keyPoints: [
        "Mechanical extraction suits the small model and judgment suits the large one",
        "An ablation against each model alone is what justifies the split",
        "A confidence-based cascade requires a confidence signal that is genuinely calibrated",
        "Routing adds latency and an extra failure mode, so it must be measured, not assumed",
        "Cost per successful outcome matters more than cost per call",
        "The small model's output must be constrained so its errors are detectable downstream",
      ],
      commonGotchas: [
        "Assuming two models are better than one without running the ablation",
        "Escalating on raw token probability and treating it as calibrated confidence",
        "Measuring cost per call while ignoring the retries a weak first pass causes",
      ],
      sixtySecondStructure: [
        "Give the split rule: extraction versus judgment",
        "Insist on the ablation as the justification",
        "Cover the cascade and why confidence is the hard part",
        "Close on cost per successful outcome and the added failure mode",
      ],
      followUps: [
        "What would make you collapse back to a single model?",
        "How would you detect the small model silently degrading?",
        "How do you keep two prompts in sync as the task evolves?",
      ],
    },
    source: "seed",
  },
];
