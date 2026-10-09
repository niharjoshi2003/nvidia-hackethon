# sixty

**Speak for sixty seconds. Find out what you skipped — with the receipts.**

sixty is a spoken interview drill with an evaluator that is not allowed to give
feedback it cannot prove. After you talk for a minute, two NVIDIA Nemotron
models running on Nebius Token Factory compare what you said against that
topic's rubric and name **one** thing you missed. The finding only reaches you
if it can quote your own words and cite a rubric line verbatim. If it can't, it
is thrown away and you are told it was thrown away.

That miss is then stored, and it decides what you practise next.

Built for the [Nebius x NVIDIA Global AI Hackathon](https://nebiusglobalaihackathon.devpost.com/),
**Personal AI** track.

**Live demo:** follow [`docs/DEPLOY.md`](docs/DEPLOY.md) (Vercel + server env vars). Paste the production URL here after deploy.

**Demo video:** record per [`docs/spec/06-demo.md`](docs/spec/06-demo.md) (≤3 min, public YouTube) and link here before Devpost submit — checklist in [`docs/SUBMISSION.md`](docs/SUBMISSION.md).

### Screenshots

| Debrief citation | Refusal | Open miss on Home |
| --- | --- | --- |
| ![Debrief with quote and rubric line](docs/screenshots/debrief-citation.svg) | ![Unsupported judgment discarded](docs/screenshots/refusal.svg) | ![Home leads with open miss](docs/screenshots/home-open-miss.svg) |

Replace SVG placeholders with PNG captures — see [`docs/screenshots/README.md`](docs/screenshots/README.md).

---

## The problem

Every spoken-practice tool asks you to rate your own answer. That is the one
thing you are worst at, because you cannot notice the thing you failed to say.
You finish a minute on retries and backoff, feel good about it, rate yourself a
4, and never register that you never once said "idempotency key."

Generic AI feedback makes this worse, not better. "Add more depth" and "good
structure, consider edge cases" are unfalsifiable. They feel like coaching and
change nothing.

## What sixty does differently

**The evaluator must cite, or it says nothing.** Every finding carries two
things that can be checked mechanically:

- a **quote** that occurs verbatim in your transcript, and
- a **rubric line** copied exactly from the topic you were answering.

Both are verified in the browser, against the transcript you actually spoke,
before anything is shown or stored. A reworded rubric line is rejected on
purpose — if the model may reword the rubric, "grounded in your rubric" stops
meaning anything.

**Refusals are a feature, not an error.** When the gate rejects a finding, you
see "the evaluator produced a judgment it could not support, so it was
discarded" instead of a confident paragraph backed by nothing. The refusal
count sits next to the success count on the Progress screen.

**A complete answer gets no invented miss.** If nothing substantive was left
out, the evaluator says so instead of manufacturing a flaw. Because an absence
cannot be quoted, that verdict is cross-checked: it is accepted only when the
independent coverage pass marked every key point as covered, and declined
otherwise.

**The miss changes what happens next.** An open miss takes the front of
tomorrow's plan even when spaced repetition would wait weeks, and it is shown
to you again before you speak on that topic. Resolve it and the topic drops
back to its normal schedule.

**A habit becomes visible across topics.** Every miss is bucketed into a closed
category set, so sixty can tell you "you skipped the failure mode in 7 of 9
answers, across 5 different topics" — an insight no single session could
produce.

---

## How Nemotron and Token Factory are used

Grading is two calls, in a fixed order, both to Nebius Token Factory:

| Stage | Model | Job |
| --- | --- | --- |
| Coverage | Nemotron (small tier), `NEMOTRON_NANO` | Mechanical extraction: which rubric key points did the answer cover? |
| Judgment | Nemotron (large tier), `NEMOTRON_ULTRA` | The one call that needs judgment: which single miss matters most, and can it be cited? |

The split is a claim about cost and quality, so it is measured rather than
asserted — see [Evaluation](#evaluation).

The model never chooses the next step, never picks a tool, and never writes to
storage. `src/agent/gradeSpokenAnswer.ts` runs a fixed sequence and returns an
outcome; a screen decides whether that outcome becomes a stored miss.

**Where the calls happen:** [`api/grade.ts`](api/grade.ts). The Token Factory
credential lives only on the server. The endpoint accepts a transcript and
rubric lines — never raw chat messages — so a leaked URL cannot be used as a
general-purpose model proxy, and it caps spend per IP and per day.

**Where the check happens:** [`src/agent/gradeSchema.ts`](src/agent/gradeSchema.ts).
The gate runs in the browser, against the transcript the user actually has, so
it cannot be quietly skipped by a server that would rather look successful.

### What leaves your browser

Only the transcript and the current topic's rubric lines.

Your audio recording is never uploaded and is discarded when you leave the
debrief. Attempts, ratings, notes, and the entire miss log live in
`localStorage`. There is no account and no server-side copy.

One honest caveat, stated in the app as well as here: speech-to-text uses the
**browser's** Web Speech API, which in Chrome and Edge streams audio to the
browser vendor's speech service. That is not on-device, and sixty does not
claim it is. This is also why there is a transcript review step — you read and
correct the text before anything is graded.

---

## Running it

Requires Node 20+ and a Nebius Token Factory API key.

```bash
git clone <this repo>
cd sixty
npm install
cp .env.example .env      # then fill in the values below
npm run dev               # http://localhost:5173
```

Fill in `.env`:

```bash
TOKEN_FACTORY_API_KEY=...     # server-side only, never exposed to the browser
NEMOTRON_NANO=...             # exact id from the Token Factory catalog
NEMOTRON_ULTRA=...            # exact id from the Token Factory catalog
```

Model ids are never hardcoded. To print the ids your account actually serves,
along with latency and cost per grade:

```bash
npm run spike
```

That script ([`scripts/spike-tokenfactory.mjs`](scripts/spike-tokenfactory.mjs))
is the feasibility gate the project was built behind: it verifies the catalog,
tests structured-output support, runs a complete two-stage grade against a
fixture with a deliberately planted omission, and checks that the citation gate
passes on real model output.

### Checks

```bash
npm run lint
npm run typecheck
npm test          # 111 tests
npm run build
```

### Using it without the hosted key

The deployed demo shares a small budget. Once it is spent, paste your own Token
Factory key into Settings — it stays in your browser, is sent with each grade
request, and is never stored server-side.

---

## Try it in two minutes

1. Open a topic and glance at its gotchas — that is the rubric you're being
   held to.
2. Speak for a minute and **deliberately leave one of them out**.
3. Read the miss: your own sentence, the rubric line you skipped.
4. Reload. That topic now leads your plan, and the miss is on screen before the
   timer starts.
5. Answer again and cover the line. The miss closes and the topic returns to
   its normal schedule.

---

## Architecture

```
Browser                                    │ Server            │ Nebius
───────────────────────────────────────────┼───────────────────┼──────────────
MediaRecorder ──► audio (never leaves)     │                   │
Web Speech ─────► transcript               │                   │
                     │                     │                   │
                     ▼                     │                   │
              transcript review            │                   │
                     │                     │                   │
     transcript + rubric lines ────────────► /api/grade ───────► Nemotron small
                                           │   (holds key,     │   (coverage)
                                           │    rate limits,   │
                                           │    budget cap)    │
                                           │        │          │
                                           │        └──────────► Nemotron large
                                           │                   │   (judgment)
                     ◄─────── raw output + call trace ─────────┘
                     │                     │
                     ▼                     │
            citation gate (local)          │
            quote in transcript?           │
            rubric line supplied?          │
                     │                     │
         ┌───────────┴───────────┐         │
      accepted                rejected     │
         │                       │         │
   stored as SpokenMiss    shown as a      │
         │                 refusal,        │
         ▼                 stored nowhere  │
   next session leads with it              │
```

### Layout

| Path | What is there |
| --- | --- |
| `src/agent/gradeSchema.ts` | The citation gate. The core of the project. |
| `src/agent/gradeSpokenAnswer.ts` | Fixed-order orchestrator, no model-chosen branching. |
| `src/agent/prompts.ts` | Both prompts. Every instruction has a matching check in the gate. |
| `api/grade.ts` | The only networked code. Holds the credential. |
| `src/lib/misses.ts` | Miss memory and the cross-topic pattern. |
| `src/lib/selection.ts` | Where an open miss outranks spaced repetition. |
| `src/lib/scheduler.ts` | SM-2, deliberately untouched by grading. |
| `src/data/topics/` | 17 hand-authored rubrics across four tracks. |

Rubric quality is enforced by tests, not convention: every line must be unique
after normalisation (or citations would be ambiguous) and at least six words
(or the evaluator can only produce the vague miss this project exists to
avoid).

---

## Bring your own rubric

The evaluator is not specific to interview prep — it grades a spoken answer
against whatever rubric it is handed. Settings accepts a JSON rubric, which
makes sixty usable for any spoken skill with a checklist: a clinical viva, a
sales pitch, a language exam, an internal competency framework.

Imported rubrics are validated to the same standard as the seeds.

---

## Evaluation

Frozen set: **37** typed transcripts across **17** topics in [`eval/fixtures.json`](eval/fixtures.json)
(17 complete, 17 single omissions, 3 noisy omissions). Labels are rubric-aligned;
replace with independently labelled spoken recordings when you have them.
Regenerate the scaffold with `node --use-system-ca ./node_modules/vite-node/vite-node.mjs scripts/build-eval-fixtures.mjs`.

```bash
npm run eval                  # all three configurations
npm run eval -- two-stage     # just one
```

Harness: [`scripts/eval.ts`](scripts/eval.ts) — production orchestrator + citation gate,
in-process [`api/grade.ts`](api/grade.ts). Spike ids and latency: [`docs/evaluation.md`](docs/evaluation.md).

**Inter-rater agreement (ceiling):** 37 of 37 label pairs agree on the frozen set.

**Release gates (two-stage run):**

| Gate | Result |
| --- | --- |
| Zero accepted fabricated citations | Pass (gate rejects bad quotes/lines before storage) |
| Median grade latency | **6890 ms** (under 8 s) |
| False miss on a complete answer | **1 of 17** complete fixtures graded a miss (`sd-queue-delivery-complete`) |
| Unsupported / declined judgments | **2** refusals on omissions (schema / coverage cross-check) |

**Ablation** (counts vs label **A**, not percentages; frozen set in [`eval/fixtures.json`](eval/fixtures.json)):

| Configuration | Agrees with A | Agrees with B | False misses | Declined | Failed | Median ms | Tokens in/out |
| --- | --- | --- | --- | --- | --- | --- | --- |
| two-stage | 34 of 37 | 34 of 37 | 1 of 17 | 2 | 0 | 6890 | 42714 / 59164 |
| nano-only | 21 of 37 | 21 of 37 | 1 of 17 | 4 | 10 | 16792 | 35893 / 74305 |
| ultra-only | 36 of 37 | 36 of 37 | 0 of 17 | 1 | 0 | 5159 | 42699 / 53377 |

On this rubric-aligned set, **Ultra alone scored higher agreement than the two-stage split** (36 vs 34 agrees-with-A), at lower median latency. We still ship two-stage in production because Nano keeps the coverage pass cheap and separates extraction from judgment; the ablation is reported honestly. Per-answer rows: [`eval/results/`](eval/results/). Re-run: `npm run eval`.

## Known limitations

- Speech recognition uses the browser's service, not on-device (see above).
  Firefox is unsupported; Chrome and Edge work.
- The endpoint's rate limiter is in-process, so the real ceiling is the limit
  times the number of warm serverless instances. That meaningfully reduces
  blast radius for a demo budget but is not a real quota system; a shared store
  would be the right answer beyond a hackathon.
- 17 topics, not hundreds. Rubric depth decides whether a miss is specific, and
  depth does not scale by generation.
- One browser profile is one person. No sync, by design.

## What was built during the submission window

All of it. This repository was created and built inside the hackathon window;
every commit is in the log. A local prototype of the untimed drill loop by the
same author predates it, and none of that code is here — the timer, scheduler,
rubrics, grading path, citation gate, miss memory, and UI in this repo were
written from scratch for this submission.

## License

MIT. See [LICENSE](LICENSE).
