# Production RAG sample

Saved 10 October 2026 from a coach result in sixty.

Question: Design a production RAG system for a company knowledge base. Walk through the architecture, and say where you would look if the answers were wrong.

## What you said

**Landed** — Walk through the architecture of the RAG system

Nothing on-target yet for this part.

**Landed** — Say where you would look if the answers were wrong

Nothing on-target yet for this part.

The rest did not answer the question.

## Verdict

You answered every part of the question.

## Say this next

Retrieval is evaluated separately from generation because a single end-to-end score hides which half failed

## Full analysis

Two Nemotron models, same prompt, rated independently. Every claim below is checked against your words.

Final verdict: **Developing (split decision)**

Models split. Ultra says solid (64), Nano says developing (45). When they split, the stricter reading stands, so you are not credited for something only one model saw.

### Nano

`nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` — 45 — Developing

| Parameter | Score | Detail |
| --- | --- | --- |
| Answered the question | 100 | 2 of 2 parts addressed |
| Quality of what you said | 17 | 9 points rated |
| Key ideas covered | 0 | 0 of 6 key points supported |
| Skill level | 0 | average level 1.0 of 4 across 2 skills |

Justified 0, Correct 0, Vague 9, Wrong 0.

Nano reads this as developing: 2 of 2 question parts addressed, 0 points credited against 9 vague or wrong, and 0 of 6 key ideas landed.

Best point, in Nano’s view: “We will start with the best of injection means ingesting the documents”

Mentions retrieval but not evaluation separation.

Weakest point: “Retrieve each question answer accordingly”

Mentions multiple questions but not retrieval evaluation.

What Nano says is most missing: Chunk boundaries follow the document structure so one fact is not split into pieces that never retrieve together

You said you split documents into chunks but did not explain how the splits match the document structure. This is why retrieval may break facts across chunks.

### Ultra

`nvidia/Nemotron-3-Ultra-550b-a55b` — 64 — Solid

| Parameter | Score | Detail |
| --- | --- | --- |
| Answered the question | 100 | 2 of 2 parts addressed |
| Quality of what you said | n/a | 0 points rated |
| Key ideas covered | 0 | 0 of 6 key points supported |
| Skill level | 33 | average level 2.0 of 4 across 2 skills |

Ultra reads this as solid: 2 of 2 question parts addressed, 0 points credited against 0 vague or wrong, and 0 of 6 key ideas landed.

What Ultra says is most missing: Retrieval is evaluated separately from generation because a single end-to-end score hides which half failed

You say you will trace the answer path and check documents, but you do not describe a method to separate retrieval failures from generation failures, which is essential for debugging RAG systems.

## How the score is built

- 40% Answered the question. Question parts the model marked addressed, each backed by a quote from you.
- 30% Quality of what you said. Each point: wrong 0, vague 1/3, correct 2/3, justified 1; halved when only related, zero when off-topic.
- 15% Key ideas covered. Key points supported by at least one of your correct or justified points.
- 15% Skill level. Mean of the skill levels, 1 to 4, scaled so level 1 is 0 and level 4 is 100.

Bands: 80+ strong, 60–79 solid, 40–59 developing, below 40 not yet. A parameter that does not apply to this question is left out and the weights rescale.

## What was not in the paste

The point-by-point tab listed nine fragments. Only the best and weakest quotes above were in the saved text. The other seven are marked `[wording not included in the saved sample]` in the reopened page, so later readers do not treat guessed sentences as the answer. Call timings were not in the paste, so “How it ran” shows the pipeline steps without invented durations.
