# sixty — what exists, and what we build on top

This is the alignment doc. Read this file. The sixty app is on one machine and is not in this repository, so everything a teammate needs is written here.

Event: [Nebius x NVIDIA Global AI Hackathon](https://nebiusglobalaihackathon.devpost.com/). Track: **Personal AI**. Deadline: **30 October 2026, 10:00am PDT**.

We are not building a new app. We are adding a spoken grade to the drill that already exists.

## Where the code is

The product is a local React app. It is not published from this repo.

| | |
|---|---|
| App path on the machine that has it | `../sixty/sixty` next to this repo, full path `c:\Users\Hp\OneDrive\Desktop\sixty\sixty` |
| This repo | The spec. Product code stays in the sixty app. We edit sixty, not a second copy. |
| Run | `npm install` then `npm run dev`, then open `http://localhost:5173` |
| Checks | `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` |
| Ship shape | Static `dist/`. A Vercel rewrite already exists at `vercel.json`. |

sixty existed before 26 August 2026. The hackathon submission must say what we added during the window. The addition is the spoken grade and the miss that changes the next session.

## What sixty already is

A 60-second interview drill for one person. No microphone, no camera, no backend. The person researches a topic, speaks against a timer, rates themselves, and comes back on a spaced-repetition schedule.

Stack already in the app: React 18, TypeScript, Vite, Tailwind, Radix, Zod, Vitest, React Router, Framer Motion. There is no server and no database.

### Screens and routes

| Route | Screen | What it does today |
|---|---|---|
| `/` | Home | Today’s plan. Filters by track and difficulty. Streak. Recent attempts. `s` rolls a surprise topic. |
| `/research/:topicId` | Research | Untimed. Scaffold starts collapsed. Notes and a 3-line cue card persist per topic. |
| `/explain/:topicId` | Explain | Full-screen timer. No chrome. Space starts and pauses. Enter finishes early. Esc abandons and writes nothing. A 3-second countdown starts the timer unless motion is reduced. |
| `/debrief/:topicId` | Debrief | Clarity, depth, and structure, each 1–5. A required note, “what did I forget”. Saving updates the schedule, mastery, XP, and badges. |
| `/dashboard` | Dashboard | Streaks, mastery, track coverage, rating trend, time histogram. |
| `/library` | Library | Search and filter the catalog. |
| `/settings` | Settings | Theme, motion, timer length (30, 45, 60, 90), plan size, export and import JSON, reset, optional topic generation. |

Keyboard outside the timer: `t` today, `d` dashboard, `l` library, `s` surprise, `⌘K` command palette. Single-letter shortcuts are ignored while a text field is focused.

### The daily plan

`src/lib/selection.ts` builds the day. `src/hooks/useDailyPlan.ts` caches it for the calendar date. Plan size is 2–6, default 4. Slots, in order, are due review, new, cold track, and wildcard. The pick is deterministic for a given day. SM-2 is not replaced by this plan. The plan only chooses which topics appear today.

### The topic catalog

160 seeded topics, each marked `source: 'seed'` and `verified: true`. Files are under `src/data/topics/`.

| Track | File | Count |
|---|---|---|
| Agentic | `agentic.ts` | 60 |
| System design | `systemDesign.ts` | 45 |
| LLM core | `llmCore.ts` | 30 |
| SWE | `swe.ts` | 25 |

Every topic already has the rubric we will grade against:

- `modelAnswer` — lines a strong spoken answer should cover
- `scaffold.keyPoints` — 4 to 7 specific points
- `scaffold.commonGotchas` — 2 to 4 traps
- `scaffold.sixtySecondStructure` — the beats of the minute
- `scaffold.followUps` — likely follow-up questions
- `framing` and `interviewQuestions` — how an interviewer asks it

We do not rebuild this library.

Settings can also generate topics through OpenAI (`gpt-4o-mini`) or Anthropic (`claude-3-5-haiku`) from the browser. That code is `src/lib/ai.ts`. Generated topics are `source: 'ai'` and `verified: false` until someone checks them. **That call does not count for the hackathon.** Grading must not use that API key.

### What an attempt stores today

`src/types.ts`. An attempt is an id, a topic id, a timestamp, how many seconds were spoken, three ratings, and the typed “what did I forget” string. Explain does not store audio. It writes the second count to `sessionStorage` under `sixty.spoken.<topicId>` and passes the same number through navigation state. Debrief reads that number. Save deletes the session key.

Progress per topic (`TopicProgress`): attempt count, last attempt time, mastery 0–100, SM-2 ease (1.3–2.8, default 2.3), interval in days, and `dueAt`.

Also stored: notes and cue cards per topic, AI-generated topics, settings, XP and badge ids, and the cached plan for today.

### Scheduling

`src/lib/scheduler.ts`, simplified SM-2. Quality is the rounded mean of clarity, depth, and structure.

- Quality 1 or 2: interval becomes 1 day, ease drops by 0.2 (floor 1.3).
- Quality 3: interval grows by 1.2, ease drops by 0.05.
- Quality 4 or 5: first review in 3 days, later reviews multiply by ease, ease rises by 0.1 (cap 2.8).
- Interval cap is 90 days.

Mastery, streaks, and XP are derived in `src/lib/mastery.ts` and `src/lib/xp.ts`. Badges are in `src/data/badges.ts`. We leave this math alone. The new rule sits in front of the daily plan, not inside `nextSchedule`.

### Where progress lives

| Store | When | Key or path |
|---|---|---|
| `localStorage` | Always | `sixty.v1` |
| `.sixty/progress.json` | Only while `npm run dev` is running | Written by a small dev endpoint `/__sixty/persist` |

Schema version is **1**. `src/lib/storage.ts` has an empty migration table. Fresh installs with no saved progress load demo data so the dashboard is not empty. Settings can export JSON, import it after a diff, and reset by typing `reset`.

There is no user account. One browser profile is one person.

## What is broken

The person is the judge of their own answer. Debrief asks them to type what they forgot. They often miss the thing they failed to say. Tomorrow’s plan is built from that self-rating, so the blind spot gets scheduled back in.

The rubric for a real grade is already on the topic. Nothing in the app compares the spoken minute to it.

## What we add

One loop on top of the screens above.

1. Explain records the minute.
2. A transcript is produced on this machine.
3. Nemotron Nano, through Nebius Token Factory, lists which key points were covered and which were skipped.
4. Nemotron Ultra, through the same API, names **one** miss: a short label, a quote from the transcript, the rubric line it failed, and one or two plain sentences.
5. The grade is rejected unless the quote is actually in the transcript and the rubric line is actually one of the lines we sent.
6. The accepted miss is saved in the same progress store as attempts.
7. The next Home plan puts that topic first while the miss is open.
8. Research and Explain show that miss before the person speaks again.

Esc still writes nothing.

The agent is two functions we write. It is not LangGraph, CrewAI, AutoGen, or LangChain. The model is not allowed to pick the next tool or to write memory. The only new package is the official `openai` client, with `baseURL` set to Token Factory.

```text
https://api.tokenfactory.us-central1.nebius.com/v1
```

| Step | Who | Network |
|---|---|---|
| Record | `MediaRecorder`, audio/webm | None |
| Transcript | Web Speech API while the timer runs | None |
| Read the rubric | Local topic object | None |
| Covered / skipped | Nemotron 3 Nano | Token Factory |
| Name the miss | Nemotron 3 Ultra | Token Factory |
| Accept or reject | Zod, plus a quote check and a rubric-line check | None |
| Save | Existing progress store, schema version 2 | None |
| Next plan | Existing daily plan, open misses first | None |

Model ids come from environment variables, not from hardcoded guesses: `VITE_NEMOTRON_NANO`, `VITE_NEMOTRON_ULTRA`, `VITE_TOKEN_FACTORY_API_KEY`, and `VITE_TOKEN_FACTORY_BASE_URL` (default is the URL above). The Token Factory key is a new settings field. It is not the OpenAI or Anthropic key already used for topic generation. Keys are never committed.

### The miss we store

```ts
interface SpokenMiss {
  id: string;
  topicId: string;
  attemptId: string;
  at: string;
  status: 'open' | 'resolved';
  missType: string;        // short label, e.g. "skipped idempotency"
  quote: string;           // words that appear in the transcript
  rubricLine: string;      // a key point, gotcha, or model-answer line we sent
  plainLanguage: string;   // one or two sentences
  model: string;           // the Ultra model id
  resolvedAt: string | null;
  calls: OutboundCall[];   // Nano, then Ultra, shown on Debrief
}
```

`missType` is what the plan groups on. Free text alone cannot drive the next session.

A miss closes when the person marks it resolved on Debrief, or when a later accepted grade lists that same rubric line as covered. A failed grade never closes a miss and never invents one.

### Grade results on Debrief

| Status | What we show |
|---|---|
| graded | Quote, rubric line, plain language, miss type, and both model ids |
| rejected | “The grade did not cite your words or a rubric line.” No paragraph. The self-rating can still save. |
| failed | “The grade did not run.” Token Factory error. Self-rating can still save. No miss is stored. |
| skipped | Empty transcript. Ultra is not called. |

Temperature is 0 on both calls. Timeout is 20 seconds. Nano may only return strings copied from `keyPoints`. Ultra’s `rubricLine` must equal a line we put in the prompt. The quote must be a substring of the transcript after lowercasing and collapsing whitespace.

### How the next day changes

Add a plan slot `open-miss`. If the latest miss for a topic is open, that topic is due today even when SM-2 would wait. Open misses fill the front of the plan, one per topic, newest first. The current filler fills the remaining seats and skips topics already taken. `nextSchedule` is unchanged. Resolving the miss returns the topic to SM-2.

## Work list

Do these in the sixty app. Do not rebuild the rows in the first table.

### Leave as they are

- The 160 seeded topics and their rubrics
- The timer, keyboard shortcuts, and Esc-abandons behavior
- SM-2 in `src/lib/scheduler.ts`
- Mastery, XP, badges, dashboard, library
- Notes, cue cards, export, import, reset
- Topic generation in `src/lib/ai.ts` (keep it, keep it off the demo)
- `localStorage` key `sixty.v1` and the dev file `.sixty/progress.json`

### Build

**Progress shape**

- Add `SpokenMiss` and `misses: SpokenMiss[]` to `AppState` in `src/types.ts`.
- Add `tokenFactoryApiKey` to `Settings`, separate from `aiApiKey`.
- Bump `SCHEMA_VERSION` to 2 in `src/lib/storage.ts`. Migration from version 1 sets `misses` to `[]` and the new key to `""`. Existing attempts and schedules must still load.

**Hearing**

- `src/audio/recorder.ts` — mic stream and `MediaRecorder`. `discard` stops the tracks.
- `src/audio/liveTranscript.ts` — Web Speech API during the minute.
- `src/audio/pendingAttempt.ts` — one in-memory slot for the blob and the transcript. Not `sessionStorage`. Not the progress file.
- `src/screens/Explain.tsx` — start the mic with the timer, write the slot on finish, clear it on Esc and on the exit button. A mic failure still allows the timer. An empty transcript means the grade is skipped.

**Grade**

- `src/agent/gradeSchema.ts` — Zod, then the quote substring check and the rubric-line membership check.
- `src/agent/tokenFactory.ts` — `openai` client, Token Factory base URL, `dangerouslyAllowBrowser: true`, temperature 0, JSON response, 20 second abort, an `OutboundCall` log.
- `src/agent/prompts.ts` — Nano classifies key points. Ultra names one miss. No study tips.
- `src/agent/gradeSpokenAnswer.ts` — fixed order: empty transcript stops, read rubric locally, Nano, Ultra, schema. The function does not touch React state.
- `src/screens/Debrief.tsx` — run the skill when a pending attempt exists. Render graded, rejected, failed, or skipped. Saving still requires the self-rating note and still calls `recordAttempt`. Append a miss only when the status is graded, using the same attempt id.

**Memory and the next session**

- `src/hooks/useStore.ts` — actions `miss/append` and `miss/resolve`.
- `src/lib/selection.ts` — slot `open-miss` at the front of `buildDailyPlan`.
- `src/hooks/useDailyPlan.ts` — pass the open miss topic ids in.
- Home card for that slot shows `missType`.
- `src/screens/Research.tsx` and Explain show `plainLanguage` for the open miss before the timer.

**Tests**

- A quote that is not in the transcript is rejected.
- A rubric line that was not in the prompt is rejected.
- Schema 1 data loads with an empty miss list.
- An empty transcript does not call Ultra.
- An open miss sorts ahead of a due review.
- Resolving that miss takes it off the front of the plan.

**Submission, in this repo and on the product README**

- Public repo with MIT, Apache 2.0, or MPL 2.0 visible in the About section.
- README section **What changed during the hackathon**: recording, Nemotron grading against the topic rubric, miss log that changes the next session. State that topic generation via OpenAI or Anthropic is older and is not the qualifying call.
- Setup steps, how to run, which Nemotron ids are used, and where Token Factory is called.
- A working demo URL or a test build a judge can run.
- Public YouTube video, 3 minutes or shorter, with audio. Record the product. One topic, two sessions. Say “Nebius Token Factory” and “NVIDIA Nemotron”. Say Nano only extracts and Ultra decides the miss. Say the recording and the miss log stayed on this machine. Show the quote and the rubric line, then the reload where Home leads with that topic.
- Devpost form: Personal AI track, Token Factory, Nemotron.
- After about five real recordings, write one agreement count in the product README: how often a teammate agrees with Ultra’s miss. Example shape: 4 of 5. A small honest number is the measurement.

### Do not build

- A new flashcard or quiz app
- A chat box
- Face video
- A backend, a vector database, or a second copy of the topic library
- An open agent loop (LangGraph, CrewAI, AutoGen, LangChain, Hermes, NemoClaw, OpenShell)
- Replacing SM-2
- Tavily on the grade path. Optional later, only when a topic has fewer than three key points, and the call must show on Debrief. It is the only path to the separate Tavily prize. It is not required for Personal AI.
- Putting topic generation on the demo

## Done

A teammate who was not in the room can:

1. Open a seeded topic.
2. Speak for under a minute and leave out a gotcha that was on screen.
3. See Ultra’s miss tied to a sentence they said and a line in the scaffold.
4. Reload.
5. See that topic selected because the miss is open, with the miss still on screen.

If step 3 is a generic “needs more depth”, it is not done.

## Hackathon rules that bind the build

1. A runtime call to Nebius Token Factory. Ours is the Nano call and the Ultra call.
2. At least one NVIDIA open model. Ours is Nemotron.
3. Public Git host, open-source license file, README with setup and where Nemotron and Token Factory are used.
4. A demo URL, hosted app, or test build that actually runs.
5. Public YouTube video, at most 3 minutes, that explains the Token Factory and Nemotron usage out loud.
6. Because sixty existed before 26 August 2026, a written explanation of what changed during the submission window.

Judging is technical implementation, design, potential impact, and quality of the idea. The technical score is Token Factory and Nemotron doing the grade, not a decorative call. The design score is the existing sixty loop with the miss as a screen, not a JSON dump. The idea is the diagnosis against this topic’s rubric, and a second session that exists because the miss was stored.

Prize this demo is aimed at: Personal AI track. Grand prize is only in play if that two-session clip is exceptional. Token Factory credits: activation code `NEBIUS-DEVPOST-GLOBAL26`, plus the Nebius Builders Program.
