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

## Usage tally (optional): how many people tried it

The Overview page can show "N interviews by M people, average score X". It needs
a small Redis database; without one the tally simply does not appear.

1. Vercel dashboard, your project, **Storage** (or **Marketplace**), add **Upstash for Redis**, pick the free plan and a region near your functions, and **connect it to this project** for Production and Preview.
2. That adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` to the project's environment variables. The code reads those, or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` if you create the database on upstash.com instead.
3. Redeploy (`npx vercel deploy --prod`). Environment variables only apply to new deployments.
4. Check it: open `https://<your-url>/api/stats`. It should return `"enabled": true`. Finish one interview, reload, and `interviews` should be 1.
5. Seeing the raw data: Upstash console, **Data Browser**, keys starting with `sixty:`. The `sixty:recent-sessions` list holds the latest 200 session summaries (newest first): random browser/session IDs, topic, model scores, question counts, coverage, agreement and server receipt time. No names, transcripts or audio are stored. Read it privately in Data Browser or with `LRANGE sixty:recent-sessions 0 19`; there is no public session-list endpoint. Summaries are saved only when the visitor leaves the tally checkbox enabled. This is a rolling count limit, not a time-based expiration; aggregates remain after old summaries are trimmed. It does not provide cloud restore or cross-device history.
6. To zero the counters before the demo or submission, run `FLUSHDB` in the Upstash console CLI. That deletes every key in the database, so keep a database just for this.

Free-tier note: each Overview view reads about six keys, and the edge caches that response for 30 seconds, so ordinary traffic stays far below the daily command limit.

Build settings are in [`vercel.json`](../vercel.json) (`npm run build`, `dist`, SPA rewrite, `/api/grade` serverless).
