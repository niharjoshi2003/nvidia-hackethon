/**
 * The usage counter: what gets written for one finished interview, and how the
 * totals are read back.
 *
 * Everything stored is a count or a sum. There is no per-person row, no
 * transcript, and no list of what anyone said. The only per-visitor value is a
 * random id inside a Redis set, which is what makes "how many people" a count of
 * distinct browsers rather than a count of interviews.
 *
 * Honest limit, worth saying out loud in the README: the numbers are reported by
 * the browser. The server checks their shape and range, not whether a real
 * interview happened, so this is a usage tally for a demo, not an audit log.
 */

import type { PublicStats, TelemetryEvent } from "../src/lib/telemetrySchema";
import { TELEMETRY_BANDS } from "../src/lib/telemetrySchema";
import type { Command, Store } from "./_store";

const K = {
  sessions: "sixty:sessions",
  visitors: "sixty:visitors",
  totals: "sixty:totals",
  bands: "sixty:bands",
  topicInterviews: "sixty:topic:interviews",
  topicScoreSum: "sixty:topic:scoreSum",
  daily: "sixty:daily",
} as const;

const DAYS = 14;

const dayOf = (date: Date) => date.toISOString().slice(0, 10);

/** The one number an interview contributes: the mean of whichever models rated it. */
export function interviewScore(e: Pick<TelemetryEvent, "nano" | "ultra">): number {
  const scores = [e.nano, e.ultra].filter((s): s is number => s !== null);
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/**
 * Adds one interview to the totals. Safe to call twice with the same session id:
 * the first call adds it to a set, and only a call that really added it counts.
 */
export async function recordInterview(
  store: Store,
  e: TelemetryEvent,
  now: Date = new Date(),
): Promise<{ counted: boolean }> {
  const [added] = await store.exec([["SADD", K.sessions, e.sessionId]]);
  if (added !== 1) return { counted: false };

  const score = interviewScore(e);
  const commands: Command[] = [
    ["SADD", K.visitors, e.visitorId],
    ["HINCRBY", K.totals, "interviews", 1],
    ["HINCRBY", K.totals, "answersRated", e.rated],
    ["HINCRBYFLOAT", K.totals, "scoreSum", score],
    ["HINCRBY", K.totals, "landed", e.landed],
    ["HINCRBY", K.totals, "lines", e.lines],
    ["HINCRBY", K.totals, "agree", e.agree],
    ["HINCRBY", K.totals, "agreeTotal", e.agreeTotal],
    ["HINCRBY", K.topicInterviews, e.topicId, 1],
    ["HINCRBYFLOAT", K.topicScoreSum, e.topicId, score],
    ["HINCRBY", K.daily, dayOf(now), 1],
  ];
  if (e.band) commands.push(["HINCRBY", K.bands, e.band, 1]);

  await store.exec(commands);
  return { counted: true };
}

// --- reading -----------------------------------------------------------------------

/** HGETALL comes back as a flat [key, value, ...] list, or an object on some clients. */
function toRecord(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (Array.isArray(raw)) {
    for (let i = 0; i + 1 < raw.length; i += 2) out[String(raw[i])] = Number(raw[i + 1]);
  } else if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw)) out[k] = Number(v);
  }
  return out;
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);

export function emptyStats(enabled: boolean, now: Date = new Date()): PublicStats {
  return {
    enabled,
    interviews: 0,
    visitors: 0,
    answersRated: 0,
    averageScore: null,
    agreementPct: null,
    coveragePct: null,
    bands: { strong: 0, solid: 0, developing: 0, "not-yet": 0 },
    topics: [],
    daily: lastDays(now).map((date) => ({ date, interviews: 0 })),
    updatedAt: now.toISOString(),
  };
}

function lastDays(now: Date): string[] {
  const days: string[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    days.push(dayOf(new Date(now.getTime() - i * 24 * 60 * 60 * 1000)));
  }
  return days;
}

export async function readStats(store: Store, now: Date = new Date()): Promise<PublicStats> {
  const [visitors, totalsRaw, bandsRaw, topicCountRaw, topicSumRaw, dailyRaw] = await store.exec([
    ["SCARD", K.visitors],
    ["HGETALL", K.totals],
    ["HGETALL", K.bands],
    ["HGETALL", K.topicInterviews],
    ["HGETALL", K.topicScoreSum],
    ["HGETALL", K.daily],
  ]);

  const totals = toRecord(totalsRaw);
  const bands = toRecord(bandsRaw);
  const topicCounts = toRecord(topicCountRaw);
  const topicSums = toRecord(topicSumRaw);
  const daily = toRecord(dailyRaw);

  const interviews = totals.interviews ?? 0;

  return {
    enabled: true,
    interviews,
    visitors: Number(visitors ?? 0),
    answersRated: totals.answersRated ?? 0,
    averageScore: interviews > 0 ? Math.round((totals.scoreSum ?? 0) / interviews) : null,
    agreementPct: pct(totals.agree ?? 0, totals.agreeTotal ?? 0),
    coveragePct: pct(totals.landed ?? 0, totals.lines ?? 0),
    bands: Object.fromEntries(TELEMETRY_BANDS.map((b) => [b, bands[b] ?? 0])) as PublicStats["bands"],
    topics: Object.entries(topicCounts)
      .map(([topicId, count]) => ({
        topicId,
        interviews: count,
        averageScore: count > 0 ? Math.round((topicSums[topicId] ?? 0) / count) : null,
      }))
      .sort((a, b) => b.interviews - a.interviews),
    daily: lastDays(now).map((date) => ({ date, interviews: daily[date] ?? 0 })),
    updatedAt: now.toISOString(),
  };
}
