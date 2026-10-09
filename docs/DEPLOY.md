# Deploy the live demo (Vercel)

1. Install and sign in: `npx vercel login`
2. From the repo root: `npx vercel link` (create or link a project).
3. In the Vercel project **Settings → Environment Variables**, add for **Production** (and Preview if you want):

   | Name | Notes |
   | --- | --- |
   | `TOKEN_FACTORY_API_KEY` | Server-only; never `VITE_` |
   | `NEMOTRON_NANO` | e.g. `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` |
   | `NEMOTRON_ULTRA` | e.g. `nvidia/Nemotron-3-Ultra-550b-a55b` |

4. Deploy: `npx vercel deploy --prod`
5. Smoke-test in Chrome/Edge:
   - Full grade on one topic (deliberate omission).
   - Settings → paste your own Token Factory key (BYOK) and grade again.
   - Temporarily set a bad server key in Vercel to confirm Debrief shows **failed**, not a stored miss.
6. Copy the production URL into README **Live demo** and run:
   `gh repo edit niharjoshi2003/nvidia-hackethon --homepage <url>`

Build settings are in [`vercel.json`](../vercel.json) (`npm run build`, `dist`, SPA rewrite, `/api/grade` serverless).
