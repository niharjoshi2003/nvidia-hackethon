import type { Scorecard } from "./thread";
import { telemetrySchema, type TelemetryEvent } from "./telemetrySchema";

/**
 * The browser's half of the usage counter.
 *
 * After an interview is finished and saved to local memory, this turns the
 * scorecard into a handful of numbers and posts them. It is fire and forget: if
 * the visitor is offline, the database is not set up, or they turned counting
 * off, nothing happens and nothing is shown. Counting must never get in the way
 * of the interview.
 *
 * What is sent: the topic id, how many questions were rated, two scores, a
 * verdict band, and counts. What is not sent: any word of any answer, the
 * questions, audio, or anything that names the visitor.
 */

const VISITOR_KEY = "sixty.visitor.v1";
const CONSENT_KEY = "sixty.telemetry";

function randomHex(length: number): string {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, length);
}

/** A random id for this browser, made once. Clearing site data makes a new one. */
export function getVisitorId(): string {
  try {
    const existing = localStorage.getItem(VISITOR_KEY);
    if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
    const made = `v${randomHex(24)}`;
    localStorage.setItem(VISITOR_KEY, made);
    return made;
  } catch {
    // Storage blocked: an id that lasts for this page only still counts the interview once.
    return `v${randomHex(24)}`;
  }
}

/** Counting is on unless the visitor turned it off. */
export function telemetryEnabled(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setTelemetryEnabled(on: boolean): void {
  try {
    if (on) localStorage.removeItem(CONSENT_KEY);
    else localStorage.setItem(CONSENT_KEY, "off");
  } catch {
    // Nothing to remember it in; the choice then lasts until the page closes.
  }
}

type CardParts = Pick<Scorecard, "coverage" | "overall" | "agreement" | "asked" | "rated">;

/**
 * The numbers for one finished interview, or null when there is nothing worth
 * counting (no answer was rated, so there is no score to report).
 */
export function eventFromScorecard(args: {
  topicId: string;
  startedAt: string;
  visitorId: string;
  card: CardParts;
}): TelemetryEvent | null {
  const { card, topicId, visitorId, startedAt } = args;
  if (card.rated === 0) return null;

  const asked = card.coverage.filter((row) => row.status !== "not-asked");
  const started = Date.parse(startedAt);
  const stamp = Number.isNaN(started) ? randomHex(10) : started.toString(36);

  const event = {
    v: 1,
    // Derived from the interview, so counting it again after a reload is a no-op.
    sessionId: `${visitorId.slice(0, 12)}-${stamp}`,
    visitorId,
    topicId,
    asked: Math.min(10, Math.max(1, card.asked)),
    rated: Math.min(10, card.rated),
    nano: card.overall.nano === null ? null : Math.round(card.overall.nano),
    ultra: card.overall.ultra === null ? null : Math.round(card.overall.ultra),
    band: card.overall.band,
    landed: asked.filter((row) => row.status === "landed").length,
    lines: asked.length,
    agree: card.agreement?.agree ?? 0,
    agreeTotal: card.agreement?.total ?? 0,
  };

  // The same schema the server uses. Anything it would reject is not worth sending.
  const checked = telemetrySchema.safeParse(event);
  return checked.success ? checked.data : null;
}

/** Posts the event. Resolves true only when the server counted it; never throws. */
export async function sendInterview(
  event: TelemetryEvent,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!telemetryEnabled()) return false;
  try {
    const res = await fetchImpl("/api/collect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      keepalive: true,
    });
    if (!res.ok) return false;
    const body = (await res.json().catch(() => null)) as { counted?: boolean } | null;
    return body?.counted === true;
  } catch {
    return false;
  }
}
