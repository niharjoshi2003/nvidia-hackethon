import type { Topic } from "@/types";

export const systemDesignTopics: Topic[] = [
  {
    id: "sd-idempotent-writes",
    track: "system-design",
    title: "Making a write endpoint safe to call twice",
    difficulty: "core",
    framing:
      "A mobile client retries on flaky networks. Design the write path so a duplicate request cannot double-apply.",
    interviewQuestions: [
      "How do you make a POST endpoint idempotent?",
      "Where does the idempotency key live and when does it expire?",
      "What happens when two identical requests arrive concurrently?",
    ],
    modelAnswer: [
      "The client generates an idempotency key once per logical operation and reuses it across retries",
      "The server records the key and the response atomically with the write, in the same transaction",
      "A replay returns the stored original response rather than performing the work again",
      "Concurrent duplicates are resolved by a uniqueness constraint on the key, so one wins and the other reads the result",
    ],
    scaffold: {
      keyPoints: [
        "The client generates the idempotency key once per logical operation and holds it across retries",
        "The key and the response are persisted atomically with the write, in one transaction",
        "A replay returns the stored original response instead of redoing the work",
        "A uniqueness constraint on the key resolves two concurrent duplicates without a race",
        "Keys need a retention window, and the behaviour after expiry must be defined",
        "A key must be scoped to the caller so one tenant cannot collide with another",
      ],
      commonGotchas: [
        "Checking for the key and then writing in two separate steps, which leaves a race between them",
        "Letting the server generate the key, which cannot survive a client retry",
        "Keeping keys forever and treating the table as free",
      ],
      sixtySecondStructure: [
        "State who generates the key and when",
        "Give the atomicity requirement: key and write in one transaction",
        "Handle the concurrent case with the uniqueness constraint",
        "Close on retention, scoping, and what a replay returns",
      ],
      followUps: [
        "What if the request body differs but the key is the same?",
        "How does this interact with a queue that already gives at-least-once delivery?",
        "What is the behaviour after the key expires?",
      ],
    },
    source: "seed",
  },
  {
    id: "sd-cache-invalidation",
    track: "system-design",
    title: "Choosing a cache invalidation strategy and living with it",
    difficulty: "core",
    framing:
      "Your read-heavy service adds a cache. Sometimes users see stale data. Walk me through the options and what you would pick.",
    interviewQuestions: [
      "How do you invalidate a cache?",
      "When is a TTL good enough, and when is it not?",
      "What is a thundering herd and how do you avoid one?",
    ],
    modelAnswer: [
      "The choice is a staleness budget: how wrong the data may be and for how long, stated as a number",
      "A TTL is the cheapest option and is correct when bounded staleness is acceptable",
      "Explicit invalidation on write gives freshness but creates a consistency problem between the store and the cache",
      "An expiring hot key causes a thundering herd unless requests are coalesced or the value is refreshed early",
    ],
    scaffold: {
      keyPoints: [
        "Start from a staleness budget stated as a number, because that decides the strategy",
        "A TTL is cheapest and is correct whenever bounded staleness is acceptable",
        "Invalidation on write buys freshness at the cost of consistency between store and cache",
        "An expiring hot key causes a thundering herd unless requests are coalesced",
        "Early or probabilistic refresh keeps a hot key warm without a stampede",
        "Cache failure must degrade to the origin rather than to an error",
      ],
      commonGotchas: [
        "Writing to the cache and the database separately, leaving the two permanently divergent on failure",
        "Never stating how stale is acceptable, so the strategy cannot be justified",
        "Ignoring what happens when the cache itself goes down",
      ],
      sixtySecondStructure: [
        "Open with the staleness budget as the deciding input",
        "Compare TTL against write invalidation in one sentence each",
        "Name the thundering herd and the mitigation",
        "Close on graceful degradation when the cache is unavailable",
      ],
      followUps: [
        "How would you measure your actual staleness in production?",
        "Where would you put the cache: client, edge, or service?",
        "What breaks if two services cache the same entity?",
      ],
    },
    source: "seed",
  },
  {
    id: "sd-rate-limiting",
    track: "system-design",
    title: "Rate limiting a public API you cannot trust",
    difficulty: "core",
    framing:
      "You are exposing an expensive endpoint publicly. Design the rate limiting.",
    interviewQuestions: [
      "Which rate limiting algorithm would you use and why?",
      "How do you rate limit across many instances?",
      "What do you return when someone is limited?",
    ],
    modelAnswer: [
      "A token bucket allows controlled bursts while bounding the sustained rate, which matches real client behaviour",
      "The limiter state must be shared across instances or each instance enforces its own separate limit",
      "The response must be 429 with a Retry-After header so a well-behaved client can back off correctly",
      "A cost ceiling independent of request count is needed when requests have very different costs",
    ],
    scaffold: {
      keyPoints: [
        "A token bucket permits controlled bursts while bounding the sustained rate",
        "A fixed window allows double the limit across a window boundary, which a sliding window avoids",
        "Limiter state must be shared across instances or each one enforces its own separate limit",
        "The response must be 429 with Retry-After so a correct client can back off",
        "Requests with very different costs need a spend ceiling, not just a request count",
        "The limiter must fail open or fail closed by explicit decision, not by accident",
      ],
      commonGotchas: [
        "Keeping the counter in process memory, so the real limit multiplies by the instance count",
        "Returning a generic error with no signal for when the client may retry",
        "Counting requests when the thing you actually need to protect is cost",
      ],
      sixtySecondStructure: [
        "Pick the algorithm and justify it in one line",
        "Address distribution: where the state lives",
        "Give the client contract: 429 and Retry-After",
        "Close on cost-based limiting and the fail-open decision",
      ],
      followUps: [
        "What do you key the limit on when clients are unauthenticated?",
        "How do you stop the limiter itself becoming the bottleneck?",
        "How would you give one customer a higher limit?",
      ],
    },
    source: "seed",
  },
  {
    id: "sd-queue-delivery",
    track: "system-design",
    title: "At-least-once delivery and what it forces on the consumer",
    difficulty: "advanced",
    framing:
      "You put a queue between two services. What does the consumer now have to handle that it did not before?",
    interviewQuestions: [
      "What does at-least-once delivery mean for the consumer?",
      "How do you handle a message that always fails?",
      "Is exactly-once possible?",
    ],
    modelAnswer: [
      "Adding the queue moves duplicate handling onto the consumer, which now needs a deduplication story it did not need before",
      "Exactly-once delivery is not achievable end to end, but exactly-once effects are, through deduplication at the consumer",
      "A permanently failing message must go to a dead letter queue or it blocks the partition forever",
      "Visibility timeouts must exceed processing time or the message is redelivered while still being handled",
    ],
    scaffold: {
      keyPoints: [
        "At-least-once means duplicates are normal, so the consumer must be idempotent by design",
        "Exactly-once delivery is unachievable end to end, but exactly-once effects are reachable via deduplication",
        "A permanently failing message needs a dead letter queue or it blocks progress",
        "The visibility timeout must exceed real processing time or a message is redelivered mid-flight",
        "Ordering guarantees usually hold only within a partition, not across the topic",
        "Retry with backoff must be bounded, and the dead letter queue must be monitored",
      ],
      commonGotchas: [
        "Claiming exactly-once delivery rather than exactly-once effects",
        "Setting a visibility timeout shorter than the work, causing duplicate concurrent processing",
        "Creating a dead letter queue that nobody ever reads",
      ],
      sixtySecondStructure: [
        "Lead with the consequence: duplicates are the normal case",
        "Draw the distinction between delivery and effects",
        "Cover poison messages and the dead letter queue",
        "Close on visibility timeout and ordering scope",
      ],
      followUps: [
        "How do you deduplicate without unbounded state?",
        "What ordering do you actually need for this workload?",
        "How do you replay a dead letter queue safely?",
      ],
    },
    source: "seed",
  },
];
