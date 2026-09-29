import type { Topic } from "@/types";

export const sweTopics: Topic[] = [
  {
    id: "swe-code-review",
    track: "swe",
    title: "Reviewing a large pull request without wasting everyone's time",
    difficulty: "foundational",
    framing:
      "A colleague sends you a 900-line pull request. How do you review it?",
    interviewQuestions: [
      "How do you approach reviewing a large change?",
      "What do you comment on and what do you let go?",
      "How do you disagree with an approach without blocking the team?",
    ],
    modelAnswer: [
      "Understand the intent and the tests before reading the implementation line by line",
      "Separate blocking concerns like correctness and security from preferences, and label which is which",
      "Style disagreements belong to a linter, not to a human reviewer",
      "A fundamental design concern on a 900-line branch is a signal the conversation should have happened earlier",
    ],
    scaffold: {
      keyPoints: [
        "Read the intent and the tests before reading the implementation",
        "Separate blocking concerns from preferences and say explicitly which is which",
        "Style questions belong to an automated linter, not to a reviewer's comments",
        "Correctness, security, and irreversible decisions are what justify blocking",
        "A design disagreement at review time means the design conversation happened too late",
        "Ask questions where you are uncertain rather than asserting a fix",
      ],
      commonGotchas: [
        "Leaving thirty style comments and missing the concurrency bug",
        "Blocking on personal preference without labelling it as such",
        "Rewriting the author's approach in comments instead of discussing the tradeoff",
      ],
      sixtySecondStructure: [
        "Start with intent and tests as the entry point",
        "Give the blocking versus preference split",
        "Push style to tooling",
        "Close on what a late design disagreement actually signals",
      ],
      followUps: [
        "How would you have prevented a 900-line PR?",
        "How do you review a change in code you do not know?",
        "When do you take a review to a call?",
      ],
    },
    source: "seed",
  },
  {
    id: "swe-debugging-production",
    track: "swe",
    title: "Debugging an intermittent production failure",
    difficulty: "core",
    framing:
      "One request in a thousand fails and you cannot reproduce it locally. Walk me through what you do.",
    interviewQuestions: [
      "How do you debug something you cannot reproduce?",
      "What do you do first during an incident?",
      "How do you know you actually fixed it?",
    ],
    modelAnswer: [
      "Stop the bleeding first: mitigation and diagnosis are separate activities with different urgency",
      "Characterise the failing population before theorising, because the pattern usually names the cause",
      "Form a hypothesis that predicts something specific and then test that prediction against the data",
      "A fix without a reproduction or a mechanism is a guess, and needs a way to confirm it in production",
    ],
    scaffold: {
      keyPoints: [
        "Mitigate first, because stopping harm and finding the cause are separate activities",
        "Characterise the failing population before theorising, since the pattern often names the cause",
        "Form a hypothesis that predicts something specific, then test that prediction",
        "A fix without a reproduction or a known mechanism is a guess and must be treated as one",
        "Intermittent failures concentrate in concurrency, resource exhaustion, and time or ordering assumptions",
        "Confirm the fix with the same metric that showed the problem, over a comparable window",
      ],
      commonGotchas: [
        "Changing something plausible and declaring victory when the rate drops by chance",
        "Investigating the cause while the incident is still actively harming users",
        "Adding logging without a hypothesis about what it would distinguish",
      ],
      sixtySecondStructure: [
        "Separate mitigation from diagnosis and do mitigation first",
        "Characterise the failing set: who, when, which instance",
        "Give the hypothesis-and-prediction loop",
        "Close on how you confirm the fix rather than assume it",
      ],
      followUps: [
        "What would you add to make this class of bug visible next time?",
        "How do you decide it is not worth chasing further?",
        "How do you hand off an unfinished investigation?",
      ],
    },
    source: "seed",
  },
  {
    id: "swe-technical-debt",
    track: "swe",
    title: "Making the case for paying down technical debt",
    difficulty: "core",
    framing:
      "You want two weeks to refactor. Your manager asks why that is worth delaying features. What do you say?",
    interviewQuestions: [
      "How do you justify refactoring work?",
      "How do you decide what debt to pay down first?",
      "When is the right answer to leave it alone?",
    ],
    modelAnswer: [
      "Debt is only worth paying where it is currently costing something measurable, like change failure rate or lead time",
      "The argument must be made in the listener's units: delivery speed and risk, not code aesthetics",
      "Incremental refactoring alongside feature work is usually safer than a two-week stop-the-world rewrite",
      "Stable code that nobody touches carries debt that costs nothing, and is correctly left alone",
    ],
    scaffold: {
      keyPoints: [
        "Pay down debt only where it currently costs something measurable",
        "Make the argument in delivery and risk terms rather than in code quality terms",
        "Tie the cost to evidence: incident rate, lead time, or repeated bugs in the same module",
        "Incremental refactoring alongside features is usually safer than a stop-the-world rewrite",
        "Stable code nobody touches carries debt that costs nothing and should be left alone",
        "Define what done looks like, or the refactor expands without end",
      ],
      commonGotchas: [
        "Arguing from cleanliness rather than from a cost the listener already feels",
        "Proposing a big-bang rewrite when incremental change would carry less risk",
        "Refactoring the code you dislike rather than the code that is actually hurting",
      ],
      sixtySecondStructure: [
        "Set the test: is this debt costing anything right now?",
        "Translate into delivery speed and risk with evidence",
        "Argue for incremental over stop-the-world",
        "Close on when the right answer is to leave it alone",
      ],
      followUps: [
        "What metric would you show to prove the refactor worked?",
        "How do you stop the same debt accumulating again?",
        "What do you do when the answer is no?",
      ],
    },
    source: "seed",
  },
  {
    id: "swe-testing-strategy",
    track: "swe",
    title: "Deciding what to test when you cannot test everything",
    difficulty: "core",
    framing:
      "You inherit a service with no tests and two weeks before a release. What do you test?",
    interviewQuestions: [
      "Where do you start adding tests to untested code?",
      "How do you choose between unit and integration tests?",
      "What makes a test worth keeping?",
    ],
    modelAnswer: [
      "Cover the highest-consequence paths first, ranked by what failure would actually cost",
      "Characterisation tests pin current behaviour so a refactor can proceed safely, even where that behaviour is wrong",
      "Test at the boundary that is stable, because tests coupled to internals break on every refactor",
      "Coverage percentage is not the goal, since it measures execution rather than assertion",
    ],
    scaffold: {
      keyPoints: [
        "Rank by consequence of failure and cover the highest-consequence paths first",
        "Characterisation tests pin existing behaviour so a refactor can start safely",
        "Test at a stable boundary, because tests coupled to internals break on every refactor",
        "Coverage percentage measures execution, not assertion, so it is a poor target",
        "A flaky test is worse than no test because it trains the team to ignore failures",
        "One good integration test through the critical path often beats many shallow unit tests",
      ],
      commonGotchas: [
        "Chasing a coverage number instead of covering the paths that matter",
        "Writing tests against private internals, so the suite blocks every refactor",
        "Tolerating flaky tests until the whole suite is ignored",
      ],
      sixtySecondStructure: [
        "Give the ranking rule: consequence of failure",
        "Introduce characterisation tests for legacy behaviour",
        "Explain testing at a stable boundary",
        "Close on coverage being the wrong target and flakiness being corrosive",
      ],
      followUps: [
        "How do you handle behaviour that is currently wrong but depended on?",
        "What would you automate in CI first?",
        "How do you stop the suite getting slow?",
      ],
    },
    source: "seed",
  },
];
