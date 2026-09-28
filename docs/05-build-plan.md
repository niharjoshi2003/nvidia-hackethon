# Build plan

Work happens in the sixty app (`../sixty/sixty`). This repo stays the spec. Update it when a decision changes.

## Week 1 — one grade on one topic

Goal: Explain records audio, Debrief shows a real miss from Ultra.

- Add mic capture on Explain. Store the blob only for the attempt that finishes. Esc still discards it.
- Transcribe. Prefer a Token Factory model that accepts audio. If that path is unreliable, transcribe locally or with a short Nano text pass on a browser transcript, and still send the text to Ultra. The qualifying call is Ultra’s judgment, and the UI must show that.
- Prompt Ultra with the topic’s `modelAnswer`, `keyPoints`, and `commonGotchas`, plus the transcript. Require JSON: `missType`, `quote`, `rubricLine`, `plainLanguage`.
- Reject a grade that does not quote the transcript or does not point at a rubric line. Show an error instead of a vague paragraph.
- Do not change the scheduler yet.

Exit: five manual runs on two different seeded topics, each with a miss a teammate agrees is specific.

## Week 2 — memory and the next session

Goal: reload the app and see the miss change the plan.

- Persist `SpokenMiss` next to attempts.
- Home plan: an open miss sorts above a normal SM-2 due item.
- Explain or Research shows the last miss for that topic.
- Close a miss when a later Ultra grade says `rubricLine` was covered, or when the person marks it resolved on Debrief.

Exit: film a rough two-session clip. Session two must be impossible to fake without the stored miss.

## Week 3 — routing, failure, and the measurement

Goal: the video can show Nano versus Ultra, and one honest number.

- Put covered/skipped extraction on Nano. Pass that list into Ultra. Label both calls on Debrief with the model id.
- If Token Factory errors or the transcript is empty, save the attempt with no invented miss.
- Run about five recordings. Write down how often a teammate agrees with Ultra’s miss. Put that count in the README. A small honest number is the kind of result Nebius rewarded in August 2026.

Exit: agreement count written down, both model ids visible in the UI.

## Week 4 — submission

- Public repo, MIT or Apache 2.0, setup in the README, “what changed during the hackathon” section.
- Demo URL or a test-build path a judge can run.
- YouTube video from [the demo script](06-demo.md), under 3 minutes.
- Devpost form: Personal AI track, Token Factory, Nemotron, feedback section.
- Credits already claimed (`NEBIUS-DEVPOST-GLOBAL26` and Builders Program).

## Optional, only after week 3 is solid

- Tavily when the scaffold is too thin to grade. Log the call on Debrief.
- Move topic generation off OpenAI / Anthropic. Not required to submit.

## Roles

Split by the week-1 seam so two people are not editing the timer at once.

| Area | Owns |
|---|---|
| Explain + audio | Recording, discard on abandon, handoff to debrief |
| Grade client | Token Factory calls, prompts, JSON validation |
| Plan + storage | Miss record, sort order, “last miss” banner |
| Submission | README, license, video, Devpost form |
