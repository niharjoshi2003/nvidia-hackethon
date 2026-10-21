import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  eventFromScorecard,
  getVisitorId,
  sendInterview,
  setTelemetryEnabled,
  telemetryEnabled,
} from "./telemetry";
import { telemetrySchema, type TelemetryEvent } from "./telemetrySchema";
import type { CoverageRow, LineStatus } from "./thread";

const row = (index: number, status: LineStatus): CoverageRow => ({ line: `line ${index}`, index, status, cells: [] });

const card = (overrides: Partial<Parameters<typeof eventFromScorecard>[0]["card"]> = {}) => ({
  coverage: [row(0, "landed"), row(1, "partial"), row(2, "missed"), row(3, "not-asked")],
  overall: { nano: 71.4, ultra: 64.6, band: "solid" as const, agreed: true, single: false },
  agreement: { agree: 9, total: 12 },
  asked: 5,
  rated: 5,
  ...overrides,
});

const args = (c = card()) => ({
  topicId: "llm-injection-defense",
  startedAt: "2026-10-20T14:00:00.000Z",
  visitorId: "v0123456789abcdef01234567",
  card: c,
});

beforeEach(() => localStorage.clear());

describe("eventFromScorecard", () => {
  it("turns a scorecard into numbers the server schema accepts", () => {
    const event = eventFromScorecard(args());
    expect(event).not.toBeNull();
    expect(telemetrySchema.safeParse(event).success).toBe(true);
    expect(event).toMatchObject({
      topicId: "llm-injection-defense",
      asked: 5,
      rated: 5,
      nano: 71,
      ultra: 65,
      band: "solid",
      // "not-asked" lines are not part of what the interview asked about.
      lines: 3,
      landed: 1,
      agree: 9,
      agreeTotal: 12,
    });
  });

  it("carries no field that could hold anyone's words", () => {
    const event = eventFromScorecard(args())!;
    for (const value of Object.values(event)) {
      expect(typeof value === "number" || value === null || /^[A-Za-z0-9_-]+$/.test(String(value))).toBe(true);
    }
    expect(Object.keys(event).sort()).toEqual(
      ["v", "sessionId", "visitorId", "topicId", "asked", "rated", "nano", "ultra", "band", "landed", "lines", "agree", "agreeTotal"].sort(),
    );
  });

  it("gives the same session id for the same interview, so a retry counts once", () => {
    expect(eventFromScorecard(args())!.sessionId).toBe(eventFromScorecard(args())!.sessionId);
    const later = { ...args(), startedAt: "2026-10-20T15:00:00.000Z" };
    expect(eventFromScorecard(later)!.sessionId).not.toBe(eventFromScorecard(args())!.sessionId);
  });

  it("counts nothing when no answer was rated", () => {
    expect(eventFromScorecard(args(card({ rated: 0 })))).toBeNull();
  });

  it("still counts an interview only one model rated", () => {
    const event = eventFromScorecard(
      args(card({ overall: { nano: null, ultra: 58.2, band: "developing", agreed: false, single: true }, agreement: null })),
    );
    expect(event).toMatchObject({ nano: null, ultra: 58, agree: 0, agreeTotal: 0 });
  });

  it("drops an interview whose numbers the server would reject", () => {
    expect(eventFromScorecard(args(card({ coverage: [row(0, "not-asked")] })))).toBeNull();
  });
});

describe("visitor id and consent", () => {
  it("makes one id per browser and keeps it", () => {
    const first = getVisitorId();
    expect(first).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(getVisitorId()).toBe(first);
  });

  it("is on by default and remembers being switched off", () => {
    expect(telemetryEnabled()).toBe(true);
    setTelemetryEnabled(false);
    expect(telemetryEnabled()).toBe(false);
    setTelemetryEnabled(true);
    expect(telemetryEnabled()).toBe(true);
  });
});

describe("sendInterview", () => {
  const event = eventFromScorecard(args()) as TelemetryEvent;

  it("posts the event and reports whether it was counted", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ counted: true }), { status: 200 }));
    await expect(sendInterview(event, fetchImpl as unknown as typeof fetch)).resolves.toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/collect");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual(event);
  });

  it("sends nothing when the visitor switched counting off", async () => {
    setTelemetryEnabled(false);
    const fetchImpl = vi.fn();
    await expect(sendInterview(event, fetchImpl as unknown as typeof fetch)).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("never throws when the network or the server fails", async () => {
    const down = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(sendInterview(event, down as unknown as typeof fetch)).resolves.toBe(false);

    const broken = vi.fn(async () => new Response("nope", { status: 502 }));
    await expect(sendInterview(event, broken as unknown as typeof fetch)).resolves.toBe(false);
  });

  it("does not claim a duplicate was counted", async () => {
    const dup = vi.fn(async () => new Response(JSON.stringify({ counted: false }), { status: 200 }));
    await expect(sendInterview(event, dup as unknown as typeof fetch)).resolves.toBe(false);
  });
});
