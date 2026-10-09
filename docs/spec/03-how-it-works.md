# How it works

## What already exists

Product path: `c:\Users\Hp\OneDrive\Desktop\sixty\sixty`

| Piece | Where | Role |
|---|---|---|
| Today | `src/screens/Home.tsx` | Daily plan |
| Research | `src/screens/Research.tsx` | Untimed scaffold, notes, cue cards |
| Explain | `src/screens/Explain.tsx` | Full-screen timer. Space starts and pauses. Enter finishes. Esc abandons |
| Debrief | `src/screens/Debrief.tsx` | Self-ratings plus a required “what did I forget” note |
| Topics | `src/data/topics/` | Agentic, system design, LLM core, SWE. Each topic has `modelAnswer`, `scaffold.keyPoints`, `scaffold.commonGotchas` |
| Schedule | `src/lib/scheduler.ts` | SM-2 from the self-rating quality score |
| Progress | `src/lib/storage.ts`, `src/lib/filePersist.ts` | `localStorage` key `sixty.v1`, and `.sixty/progress.json` during `npm run dev` |
| Topic AI | `src/lib/ai.ts` | Optional topic generation via OpenAI or Anthropic. Not the hackathon path |

Explain stores only how many seconds were spoken (`sessionStorage`). It does not store audio.

## The new path

```text
Explain (timer + mic)
    -> audio blob kept for this attempt
    -> Nano on Token Factory
         input: transcript + key points
         output: covered / skipped points
    -> Ultra on Token Factory
         input: transcript + model answer + gotchas + Nano's covered/skipped list
         output: one miss { type, quote, rubricLine, plainLanguage }
    -> Debrief shows the miss beside the self-rating
    -> progress store appends the miss
    -> next Home plan prefers topics with an open miss
```

Abandon (Esc) still writes nothing.

## Model routing

Base URL (Token Factory, OpenAI-compatible):

`https://api.tokenfactory.us-central1.nebius.com/v1/`

| Step | Model | Why |
|---|---|---|
| Structure the transcript | Nemotron 3 Nano, or Super if Nano is weak on this prompt | High volume, mechanical: which bullets were said |
| Name the miss | Nemotron 3 Ultra | The only step that needs a judgment |

The video should say this split out loud while the UI shows which model produced which box.

API keys stay in environment variables or in the existing local settings pattern. They are not committed.

## Miss record

```ts
interface SpokenMiss {
  id: string;
  topicId: string;
  attemptId: string;
  at: string;
  missType: string;       // short label, e.g. "skipped idempotency"
  quote: string;          // words from the transcript
  rubricLine: string;     // the gotcha or model-answer line
  plainLanguage: string;  // one or two sentences
  model: string;          // the Ultra model id used
}
```

`missType` is what the scheduler and the next-session banner use. Free text alone is not enough, because the plan has to group repeats.

## How the next session changes

Today, `nextSchedule` in `src/lib/scheduler.ts` only sees a 1–5 self-rating.

Add one rule in the daily-plan selector, not a new scheduler:

- If the latest miss for a topic is still open, that topic is due even when SM-2 would wait.
- A miss closes when a later attempt’s Ultra output says the rubric line was covered, or when the person marks it resolved.

The Research or Explain header shows the last `plainLanguage` miss before the timer starts.

## Privacy, stated simply

- Audio and the miss log stay in the local progress store.
- The only required network call for grading is Token Factory.
- If Tavily is added later, that call is listed on the debrief. It is off by default.

## Failure behavior

- If Token Factory fails, the attempt still saves with the self-rating, and the debrief says the grade did not run. The plan does not invent a miss.
- If the transcript is empty, Ultra is not called.

## License and submission repo

The hackathon needs a public repo with MIT, Apache 2.0, or MPL 2.0 visible on the repo page. When we publish sixty, add that license file and a README section titled **What changed during the hackathon** that points at the grading path and the Token Factory model ids.
