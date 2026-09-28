# Problem

## Who

One person preparing for agentic-AI, system-design, LLM, or software-engineering interviews. The content is the topic library already in sixty, not a generic syllabus and not a LeetCode sheet.

## What is broken

The drill loop already exists:

1. Today’s plan picks topics (due review, new, cold track, wildcard).
2. Research shows a scaffold: key points, gotchas, a 60-second structure, and a model answer.
3. Explain is a full-screen timer. There is no microphone.
4. Debrief asks the person to rate clarity, depth, and structure, and to type what they forgot.
5. SM-2 schedules the next review from those self-ratings.

The weak step is 4. The person is the judge of their own answer. They often miss the thing they failed to say. Tomorrow’s plan then reinforces that blind spot.

Flashcard apps record that an item was wrong. They do not say why the spoken answer was wrong.

## What “fixed” looks like

After the 60 seconds, the app has the audio. A model compares what was said to that topic’s model answer and gotchas, and returns a specific miss, for example: “you explained retries and never mentioned the idempotency key.”

That miss is stored. The next session brings the topic back because the miss is still open, and the debrief shows the earlier miss before the person speaks again.

## Why this is a Personal AI project

- One user.
- Notes, audio, and the miss log stay in the app.
- Two skills: grade this answer, plan the next session from the miss log.
- The second session is different because of the first. That is the memory the track asks for.

## Why this is an NVIDIA problem, not only a study problem

NVIDIA’s open-model pitch is that you evaluate on your own rubric, on infrastructure you control, and you do not send every step to the largest model. Each sixty topic is already a rubric (model answer, key points, gotchas). Nano does the cheap pass. Ultra does the judgment. The recording never needs a closed chatbot log.
