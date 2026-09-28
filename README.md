# sixty — Nebius x NVIDIA Global AI Hackathon

We are extending **sixty**, the 60-second interview drill, so a Nemotron model hears the spoken answer, names the specific miss, and that miss decides what comes back tomorrow.

**Decision: yes, this is the project.**

The existing app already lives at `../sixty/sixty`. This repo is the plan: what we are building, how, and what the hackathon requires. Product code stays in sixty until we start the grading work there.

## Read this first

| Doc | What it answers |
|---|---|
| [Problem](docs/01-problem.md) | What is broken, and who it is for |
| [What we build](docs/02-what-we-build.md) | The product, the track, and what we will not build |
| [How it works](docs/03-how-it-works.md) | Screens, models, memory, and where Token Factory is called |
| [Hackathon rules](docs/04-hackathon.md) | What the submission must include |
| [Build plan](docs/05-build-plan.md) | Week-by-week work |
| [Demo](docs/06-demo.md) | The 3-minute video, shot by shot |
| [Judge bar](docs/07-judge-bar.md) | How this maps to what recent winners actually shipped |

## One-paragraph version

sixty picks an interview topic, the person speaks for 60 seconds, then grades themselves. The model never hears the answer, so tomorrow’s plan is based on a self-rating. We add a recording. Nemotron Nano structures the transcript. Nemotron Ultra compares it to that topic’s model answer and known gotchas, and names the miss. The miss is stored locally. The next session brings the topic back because of that miss. Track: **Personal AI**. Deadline: **30 October 2026, 10:00am PDT**.

## Stack we are keeping

- React + Vite app already in sixty
- Topics already include a model answer, key points, and common gotchas
- Progress already persists on this machine (`.sixty/progress.json` while `npm run dev` is running, plus `localStorage`)
- Scheduling is already SM-2

## Stack we are adding

- Microphone capture on the Explain screen
- Nebius Token Factory, OpenAI-compatible API
- `Nemotron Nano` (or Super) for the cheap structuring pass
- `Nemotron 3 Ultra` only for naming the miss
- A local miss log: topic, miss type, quote, date
- The daily plan reads that log

Topic generation today calls OpenAI or Anthropic from the browser. That path does not count for this hackathon. The required call is the grading call to Token Factory.
