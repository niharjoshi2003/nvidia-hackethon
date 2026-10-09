# Devpost submission checklist

Event: [Nebius x NVIDIA Global AI Hackathon](https://nebiusglobalaihackathon.devpost.com/) — **Personal AI** track.

## Required links

| Field | URL |
| --- | --- |
| Public repo | https://github.com/niharjoshi2003/nvidia-hackethon |
| Live demo | _Set after Vercel deploy — see README **Live demo**_ |
| Demo video (YouTube, ≤3 min) | _Record per [spec/06-demo.md](spec/06-demo.md), paste URL in README_ |

## What to say in the video

Follow [spec/06-demo.md](spec/06-demo.md): one topic, two sessions, reload shows open miss on Home.

Required phrases:

- “The grade runs on **NVIDIA Nemotron** through **Nebius Token Factory**.”
- “Nano only extracts which points were covered. Ultra decides the miss.”
- “We kept the recording and the miss log locally.”

End with one honest eval count from the README **Evaluation** section.

## Devpost form

- Track: Personal AI
- Highlight: Token Factory + Nemotron two-stage grade with citation gate
- “Built during the window”: see README **What was built during the submission window**
- Token Factory activation: `NEBIUS-DEVPOST-GLOBAL26`

## Before you submit

- [ ] CI green on `master`
- [ ] Live demo loads in Chrome/Edge; one full grade succeeds
- [ ] README demo + video URLs filled in
- [ ] YouTube video is **public**
