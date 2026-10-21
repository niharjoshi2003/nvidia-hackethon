/**
 * Receives one finished interview's numbers and adds them to the usage counter.
 *
 * Takes scores and counts only (see src/lib/telemetrySchema.ts). It never sees a
 * transcript, so it has nothing of that kind to log or leak. The browser sends
 * this only if the visitor left "count this interview" on.
 */

import { threadFor } from "../src/data/threads";
import { telemetrySchema } from "../src/lib/telemetrySchema";
import { recordInterview } from "./_counter";
import { getStore } from "./_store";

export const config = { runtime: "nodejs" };

const MAX_BODY_CHARS = 2000;
const LIMIT_PER_HOUR = Number(process.env.COLLECT_RATE_LIMIT_PER_HOUR || 40);
const hits = new Map<string, number[]>();

function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => t > now - 60 * 60 * 1000);
  if (recent.length >= LIMIT_PER_HOUR) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return json(405, { error: "method-not-allowed" });

  const text = await req.text().catch(() => "");
  if (text.length === 0 || text.length > MAX_BODY_CHARS) return json(400, { error: "bad-request" });

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json(400, { error: "bad-request" });
  }

  const parsed = telemetrySchema.safeParse(body);
  if (!parsed.success) {
    return json(400, { error: "bad-request", detail: parsed.error.issues[0]?.message });
  }
  const event = parsed.data;

  // Only interviews that exist are counted, so a typo or a probe cannot add topics.
  if (!threadFor(event.topicId)) return json(400, { error: "unknown-topic" });

  if (process.env.NODE_ENV === "production") {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
    if (limited(ip)) return json(429, { error: "rate-limited" });
  }

  const store = getStore();
  if (!store) return json(200, { counted: false, reason: "not-configured" });

  try {
    const { counted } = await recordInterview(store, event);
    return json(200, { counted });
  } catch (error) {
    return json(502, { error: "store-failed", detail: error instanceof Error ? error.message : String(error) });
  }
}
