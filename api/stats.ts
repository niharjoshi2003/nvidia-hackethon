/**
 * The public tally: how many interviews, how many people, how they scored.
 *
 * Aggregates only. Safe to show on a page or in a demo video. When no database is
 * configured it says so (`enabled: false`) and the page shows nothing, rather
 * than showing zeros that look like a launch nobody tried.
 */

import { emptyStats, readStats } from "./_counter";
import { getStore } from "./_store";

export const config = { runtime: "nodejs" };

const json = (status: number, body: unknown, cdn?: string) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      // The browser always asks again, so someone who just finished an interview
      // sees it counted. (A shared max-age here would let Chromium serve a stale
      // zero from its own cache for minutes.)
      "Cache-Control": cdn ? "public, max-age=0, must-revalidate" : "no-store",
      // Only Vercel's edge keeps a copy, which is what protects the database.
      ...(cdn ? { "Vercel-CDN-Cache-Control": cdn } : {}),
    },
  });

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET") return json(405, { error: "method-not-allowed" });

  const store = getStore();
  if (!store) return json(200, emptyStats(false));

  try {
    // A short edge cache keeps a busy page from hitting the database on every view.
    return json(200, await readStats(store), "s-maxage=30, stale-while-revalidate=120");
  } catch (error) {
    return json(502, { error: "store-failed", detail: error instanceof Error ? error.message : String(error) });
  }
}
