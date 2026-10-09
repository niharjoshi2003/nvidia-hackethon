# What we build

## The sentence

sixty, plus a spoken grade: the model names the miss, and the miss drives the next session.

## In scope

1. Record audio during the existing Explain timer.
2. Send the transcript (or the audio, if the Token Factory model accepts it) to Nebius Token Factory.
3. Nano structures the transcript against the topic scaffold: which key points were covered, which were skipped.
4. Ultra names one primary miss in plain language, with a short quote from the transcript and the gotcha or model-answer line it failed.
5. Save `{ topicId, missType, quote, at }` in the same local progress store as attempts.
6. Change the next plan so an open miss outranks a generic review.
7. On the next visit to that topic, show the last miss before the timer starts.
8. README in the product repo that states sixty existed before the hackathon and lists what was added during the submission window.

## Out of scope

- A new flashcard or quiz app
- Face video, or a model that “watches” the person
- A 452-problem coding sheet
- Rebuilding the topic library, the timer, the dashboard, or SM-2
- Hermes, NemoClaw, or OpenShell as a requirement. A local store plus a visible log of any outbound call is enough
- Tavily on every topic. Add it only if a topic’s notes are too thin to grade against. It is optional and is the only path to the $3,000 Tavily prize
- Replacing topic generation (OpenAI / Anthropic) unless we have time after the grade works. That feature is not the submission

## Track

**Personal AI.**

Best Apps would fit a multi-user product. This one is a single person’s drill, with memory across sessions. That is the Personal AI brief.

## Done when

A teammate can, on a clean run:

1. Open a seeded topic.
2. Speak for under a minute.
3. See Ultra’s miss, tied to a sentence they said and a line in the scaffold.
4. Reload the app.
5. See that topic selected because of the miss, with the miss still on screen.

If step 3 is a generic “needs more depth,” it is not done.
