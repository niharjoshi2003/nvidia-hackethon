# Plan: sixty as an AI interview coach

Written 10 October 2026, revised the same day. Submission closes **30 October 2026, 10:00am PDT**. Track: **Personal AI**.

Earlier alignment notes: [REPORT.md](../REPORT.md).

## The product in one line

A spoken interview coach for software engineers moving into **AI Engineer** and **Applied AI Engineer** roles. It rates what you actually said: whether you answered the question asked, how good each point was, and the one idea that would most change an interviewer's view. Two Nemotron models rate independently, every rating is tied to your own words, and the coach remembers what to test again on a different question.

## Why the grade changed

The first version listed the rubric lines and marked each one covered or missed. On a real answer that produced a screen of six "missed" rows and nothing about the answer itself. Interviewers do not grade that way. They ask three things, in this order:

1. Did the candidate answer the question that was asked?
2. Was what they said correct, and did they give the reason?
3. What important idea was left out?

The checklist only answered the third. The grade now answers all three, and the checklist becomes the reference the ratings are checked against, not the thing the candidate sees first.

## Who it is for

Mid-level software engineers who can build systems but have not yet been interviewed on RAG, agents, or evaluation. They know the words; they skip the parts interviewers probe (how you evaluate it, who is allowed to see what, what happens when it is wrong), and they state choices without the reason.

## Why this fits the Personal AI track

| Track asks for | sixty has |
|---|---|
| Persistent memory | The miss log: unanswered question parts, the gap, and weak points, with the question they came from |
| Reusable skills | Rate a spoken answer; pick the next question from open misses; repair an answer |
| Only the tools and data you choose | Audio never leaves the device; progress lives in local storage; the agent has three named tools |

## The grade

### Layer 1: did you answer the question asked

Each question lists its **parts**. *Design a production RAG system* has two: walk through the architecture, and say where you would look if the answers were wrong. Each model marks each part addressed or not. "Addressed" counts only with a quote from the transcript.

### Layer 2: every point you made, rated

The transcript becomes a list of **points**, each an exact quote. Each point gets:

| Label | Values |
|---|---|
| Relevance | on the question, related, off-topic |
| Quality | wrong, vague, correct, justified |
| Rubric line | the key point it supports, copied exactly, or none |
| Reason | one short sentence from the model |

*Correct* states the right thing. *Justified* states it and gives the reason ("hybrid search, because exact names fail in vector search"). Interviewers reward the reason; this label is how the coach builds that habit.

A point with no rubric line can still be correct or justified and still counts. A good idea that is not on our checklist is not a failure.

### Layer 3: skill levels, then one gap

Each question names two skills (for example *architecture* and *debugging*). Each skill has four written levels describing what an answer at that level sounds like. Both models pick a level. The screen shows the description of the next level up, so the candidate hears what better sounds like.

Then **one gap**: the key point that would most change an interviewer's judgment and that none of the candidate's correct or justified points supports. It is shown only when both models name the same line.

### How the two models see the same points

Speech recognition in the browser returns almost no punctuation, so the transcript cannot be split into sentences in code.

1. **Extract.** Nano, reasoning off, returns the points as exact fragments of the transcript. The gate keeps only fragments that occur in the transcript, removes overlaps, and numbers them in order. Server and browser run the same gate and get the same list.
2. **Rate.** Nano and Ultra each receive that numbered list, the question parts, the key points, and the skill levels, and rate in parallel with the same prompt and schema.
3. **Gate.** Code checks every rating: quotes must occur in the transcript, rubric lines and parts must be ones we supplied, labels must come from the closed sets, levels must be 1 to 4. Anything else is dropped. A gap whose line one of that model's own correct or justified points supports is dropped as a contradiction.
4. **Combine.** Where the models give the same label, that is the rating. Where they differ, the item is disputed and both views are shown. The candidate's decision on a disputed part is stored as a human label. Skill levels are never averaged; both are shown.

## What we claim, and what proves it

| Claim | Evidence |
|---|---|
| The ratings are accurate | Each model's agreement with **human labels** on a frozen set, per layer, shown on the results screen and in the README |
| Ratings are not invented | The gate: quotes must be in the transcript, lines and parts must be supplied, labels must come from closed sets |
| The candidate improved | A gap closes when the same key point is supported by a **justified** point on a **different** question |
| The coach is agentic | A visible trace of each tool call and the reason for it |

What we do **not** claim:

- Better speech recognition. We use the browser Web Speech API (Chrome/Edge). Voice is the input, not the feature.
- That questions were asked at a named company. Sources are labelled by strength.
- That two models agreeing means they are right. Agreement with humans is the measure.

## Which model is better: the measurement

People label a frozen set of about 30 natural spoken answers across the eight questions, on the same layers, using the same extracted points. Two people label each answer; their agreement with each other is reported first, as the ceiling.

Each model, alone and combined, is compared against the human labels:

| Measure | What it shows |
|---|---|
| Parts marked addressed correctly | Notices when you did not answer what was asked |
| Point quality matches human | Understands what you said |
| Skill level within one of human | The overall judgment is usable |
| Gaps the human says were covered | False alarms |
| **Wrong or vague points rated correct or justified** | False confidence; counts double |

False confidence counts double because a coach that praises a wrong answer does more harm than one that is too strict. Agreement between Nano and Ultra is reported but is not the score.

## Results screen, in order

1. Question parts: addressed or not, with the quote.
2. Your points: quote, relevance, quality, rubric line, the reason; disputed points show both views.
3. Skill levels from each model, with the next level up.
4. The one gap, with the quote closest to it.
5. Disputed parts for the candidate to decide.
6. Each model's agreement with human graders.

## Memory, follow-up, repair

- **Miss log** stores the gap (as today), and will add unaddressed parts and points rated wrong or vague. An item closes only on a twin question, when a justified point supports the same key point.
- **Follow-up** aims at the gap's twin first; unaddressed parts are next.
- **Repaired answer** keeps the candidate's sentences and adds the gap. Next: upgrade vague points by adding the reason and fix wrong ones. Every change is tagged with its rubric line; untagged additions are dropped.

## Content

Eight questions, done properly:

| Area | Questions |
|---|---|
| RAG | Design a production RAG system; debug a RAG pilot giving wrong answers |
| Agents | Design a safe tool-using agent; retry a tool call without repeating side effects |
| Evaluation | How do you know your LLM feature works; evaluate an agent, not a single call |
| Production | Cut cost and latency of an LLM workflow; defend your model choice |

Each question has: track, competency tags, source label, framing, **parts**, **two skills with four written levels**, follow-ups, a twin, a human-reviewed rubric of single checkable claims, and gotchas.

Source labels: **Official** (a job description or interview guide names the competency), **Reported** (a candidate account), **Community** (a curated open question bank). Do not cite interview-prep marketing pages.

## Kept as is

Web Speech capture and the transcript edit step, the citation gate idea and `src/lib/text.ts`, the topic model, twins, the interviewer agent and its fallback rule, SM-2 scheduling, local storage, replay mode, `api/grade.ts` as the only server call.

## Out of scope

Resume or job-description upload, company-specific loops, models beyond Nano and Ultra, tone or delivery scoring, accounts and sync, generated questions without human review.

## Build order

| Dates | Work | Done when |
|---|---|---|
| 10–12 Oct | Parts and skill levels for all eight questions; rating schema, gate, combine; extract and rate on the server; results screen; replay recordings in the new shape | Unit tests for every gate rule and combine case; demo runs in replay |
| 12–14 Oct | Live run against Token Factory; tune prompts on real spoken answers; `npm run replay:record` | Both models return gated ratings on all eight questions inside 25 s |
| 14–17 Oct | Frozen set of ~30 natural answers; double labelling on the new layers; `eval:coach` reports each measure for Nano, Ultra, combined | Numbers in `eval/results/` and README |
| 17–19 Oct | Miss log stores unaddressed parts and weak points; closure on justified twin points; follow-up aims at unaddressed parts | Tests for each closure rule |
| 19–21 Oct | Repair upgrades vague and wrong points, tag check on every change | Untagged additions dropped in tests |
| 21–23 Oct | Accuracy figures on screen; rate-limit handling; polish | Demo runs with the API unreachable |
| 24–26 Oct | **Record the video**; README section on what changed during the submission window | Video under 3 minutes, public |
| 26–30 Oct | Buffer: fixes, deploy check, Devpost form | Submitted by 29 Oct |

If the schedule slips, cut in this order: repair upgrades, then skill levels, then miss-log storage of weak points. Do not cut question parts, point ratings, or the human-label evaluation.

## Demo (under 3 minutes)

| Time | Shot |
|---|---|
| 0:00–0:20 | The problem: drills tell you what you skipped, never how good what you said was |
| 0:20–1:00 | Spoken answer to *Design a production RAG system*: strong on architecture, and when answers are wrong it would "look at the prompt first and then try a bigger model" |
| 1:00–1:45 | Results: both parts addressed, but that debugging point is rated wrong; chunking and hybrid search rated justified; the reranker and logging points disputed between the models; Debugging at level 1 with what level 2 sounds like; the gap is retrieval evaluation; each model's accuracy against humans |
| 1:45–2:20 | Agent trace picks the debugging twin; the candidate now gives a justified point on retrieval evaluation and the gap closes |
| 2:20–2:50 | Repaired answer; Home leads with what is still open |
| 2:50–3:00 | Data stays on the device; rating runs on NVIDIA Nemotron through Nebius Token Factory |

Lines that must be said:

- "It rates what you said, not just what you left out."
- "Both models run on NVIDIA Nemotron through Nebius Token Factory, and we measure each against human graders, not against each other."
- "A gap only closes when you cover it, with the reason, on a question you have not seen."

## Risks

| Risk | Mitigation |
|---|---|
| Extraction splits or merges points badly | Gate drops invented fragments; extraction is measured against human point lists on the frozen set |
| Models are generous and call vague points correct | The *justified* label needs a stated reason; false confidence counts double in the measure |
| Extract plus Ultra pushes latency past the timeout | Nano extraction with reasoning off; replay mode; record early |
| Labelling work grows | ~30 answers, labelled on the extracted points, not free text |
| Twins too similar, so closure is trivial | Twin differs in framing and scenario; reviewer checks each pair |
