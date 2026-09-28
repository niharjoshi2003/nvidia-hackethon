# Hackathon requirements

Event: [Nebius x NVIDIA Global AI Hackathon](https://nebiusglobalaihackathon.devpost.com/)

Submission window: 26 August 2026 – **30 October 2026, 10:00am PDT**

Winners announced: on or around 11 January 2027

## Hard requirements

1. A runtime call to **Nebius Token Factory**, or a run on Nebius AI Cloud (Serverless Jobs, Serverless Endpoints, or DevPods). Our call is Token Factory chat completions for Nano and Ultra.
2. At least one **NVIDIA open model**. We use Nemotron.
3. A public GitHub, GitLab, or Bitbucket repo with an open-source license file (MIT, Apache 2.0, or MPL 2.0) visible in the About section.
4. A README with setup steps, how to run the project, how Nemotron is used, and where Token Factory is called.
5. A working demo URL, hosted app, or test build. For a local-first app, a test build with setup instructions must actually run.
6. A public YouTube video, **3 minutes or shorter**, with audio that explains the Token Factory and Nemotron usage.
7. If the project existed before 26 August 2026, a written explanation of what was significantly updated during the submission window. sixty is that case. The spoken grade is the update.

## Track

Personal AI. The brief asks for an assistant with persistent memory, reusable skills, and access only to the tools and information the person chooses. Our skills are “grade this spoken answer” and “plan the next session from open misses.” Our memory is the miss log. Our boundary is the local progress store.

## Prizes we are actually playing for

| Prize | What it takes |
|---|---|
| Personal AI track | Jetson Orin Nano. This is the prize the demo is aimed at |
| Grand / 2nd / 3rd | $20k / $10k / $6k. Possible only if the demo is exceptional. Not the plan we depend on |
| Best Use of Tavily | $3,000, only if a Tavily call is part of the solution. Optional, after the grade works |
| Most Valuable Feedback | $100 plus swag, for filling in the feedback section |

## Credits

From the [resources page](https://nebiusglobalaihackathon.devpost.com/resources):

1. Token Factory credits form, activation code `NEBIUS-DEVPOST-GLOBAL26` ($25).
2. Nebius Builders Program for another $25 plus Tavily credits.

## Judging

- **Technical implementation.** Token Factory and Nemotron do the grade, not a decorative call.
- **Design.** The existing sixty loop should still feel finished. The miss is a screen, not a JSON dump.
- **Impact.** One user, interview drill, a miss they can act on tomorrow.
- **Idea.** The non-obvious part is the diagnosis (which rubric line was skipped), not “AI flashcards.”

## What we tell judges in the README

sixty already had topic selection, a 60-second timer, self-assessment, and spaced repetition, with no microphone. During this hackathon we added recording, Nemotron grading against the topic rubric, and a miss log that changes the next session. Topic generation via other providers is pre-existing and is not the qualifying call.
