import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import collect from "../../api/collect";
import stats from "../../api/stats";
import { emptyStats, interviewScore, readStats, recordInterview } from "../../api/_counter";
import { getStore, memoryStore, upstashStore } from "../../api/_store";
import { telemetrySchema, type TelemetryEvent } from "./telemetrySchema";

const event = (overrides: Partial<TelemetryEvent> = {}): TelemetryEvent => ({
  v: 1,
  sessionId: "session-0001",
  visitorId: "visitor-0001",
  topicId: "llm-injection-defense",
  asked: 5,
  rated: 5,
  nano: 70,
  ultra: 60,
  band: "solid",
  landed: 3,
  lines: 5,
  agree: 8,
  agreeTotal: 10,
  ...overrides,
});

const NOW = new Date("2026-10-20T12:00:00.000Z");

describe("telemetrySchema", () => {
  it("accepts a normal interview", () => {
    expect(telemetrySchema.safeParse(event()).success).toBe(true);
  });

  it.each([
    ["an extra field, such as text", { ...event(), transcript: "hello" }],
    ["a score out of range", event({ nano: 101 })],
    ["more rated than asked", event({ asked: 3, rated: 4 })],
    ["more landed than asked about", event({ landed: 6, lines: 5 })],
    ["more agreement than points", event({ agree: 11, agreeTotal: 10 })],
    ["no model score at all", event({ nano: null, ultra: null })],
    ["an id with spaces", event({ visitorId: "has spaces in it" })],
    ["an unknown band", { ...event(), band: "legendary" }],
  ])("rejects %s", (_name, bad) => {
    expect(telemetrySchema.safeParse(bad).success).toBe(false);
  });
});

describe("counting", () => {
  it("averages whichever models rated the interview", () => {
    expect(interviewScore({ nano: 70, ultra: 60 })).toBe(65);
    expect(interviewScore({ nano: null, ultra: 60 })).toBe(60);
  });

  it("adds an interview once, even if it is sent twice", async () => {
    const store = memoryStore();
    expect(await recordInterview(store, event(), NOW)).toEqual({ counted: true });
    expect(await recordInterview(store, event(), NOW)).toEqual({ counted: false });
    const s = await readStats(store, NOW);
    expect(s.interviews).toBe(1);
    expect(s.answersRated).toBe(5);
  });

  it("counts people, not interviews", async () => {
    const store = memoryStore();
    await recordInterview(store, event({ sessionId: "session-a001" }), NOW);
    await recordInterview(store, event({ sessionId: "session-a002" }), NOW);
    await recordInterview(store, event({ sessionId: "session-b001", visitorId: "visitor-0002" }), NOW);
    const s = await readStats(store, NOW);
    expect(s.interviews).toBe(3);
    expect(s.visitors).toBe(2);
  });

  it("aggregates scores, agreement, coverage, bands, topics and days", async () => {
    const store = memoryStore();
    await recordInterview(store, event({ sessionId: "session-a001", nano: 80, ultra: 60 }), NOW);
    await recordInterview(
      store,
      event({
        sessionId: "session-a002",
        topicId: "llm-release-gate",
        nano: 40,
        ultra: 20,
        band: "developing",
        landed: 1,
        lines: 5,
        agree: 2,
        agreeTotal: 10,
      }),
      NOW,
    );
    const s = await readStats(store, NOW);
    expect(s.enabled).toBe(true);
    expect(s.averageScore).toBe(50); // (70 + 30) / 2
    expect(s.agreementPct).toBe(50); // 10 of 20
    expect(s.coveragePct).toBe(40); // 4 of 10
    expect(s.bands).toEqual({ strong: 0, solid: 1, developing: 1, "not-yet": 0 });
    expect(s.topics).toEqual([
      { topicId: "llm-injection-defense", interviews: 1, averageScore: 70 },
      { topicId: "llm-release-gate", interviews: 1, averageScore: 30 },
    ]);
    expect(s.daily).toHaveLength(14);
    expect(s.daily.at(-1)).toEqual({ date: "2026-10-20", interviews: 2 });
    expect(s.daily[0]?.interviews).toBe(0);
  });

  it("reports an empty database as zeros with null averages, not as NaN", async () => {
    const s = await readStats(memoryStore(), NOW);
    expect(s).toMatchObject({ interviews: 0, visitors: 0, averageScore: null, agreementPct: null, coveragePct: null });
    expect(emptyStats(false, NOW).enabled).toBe(false);
  });
});

describe("upstash client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts the commands as a pipeline with the bearer token and unwraps the results", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([{ result: 1 }, { result: "7" }]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const store = upstashStore("https://example.upstash.io/", "secret-token");
    const out = await store.exec([
      ["SADD", "k", "a"],
      ["HINCRBY", "h", "f", 1],
    ]);
    expect(out).toEqual([1, "7"]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://example.upstash.io/pipeline");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
    expect(JSON.parse(String(init.body))).toEqual([
      ["SADD", "k", "a"],
      ["HINCRBY", "h", "f", 1],
    ]);
  });

  it("throws when the database refuses, so a failure is not counted as success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("denied", { status: 401 })));
    await expect(upstashStore("https://x.io", "t").exec([["SCARD", "k"]])).rejects.toThrow(/401/);

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([{ error: "WRONGTYPE" }]), { status: 200 })));
    await expect(upstashStore("https://x.io", "t").exec([["SCARD", "k"]])).rejects.toThrow(/WRONGTYPE/);
  });
});

describe("which store is used", () => {
  it("uses Upstash for either naming scheme, and never memory in production", () => {
    expect(getStore({ UPSTASH_REDIS_REST_URL: "https://a.io", UPSTASH_REDIS_REST_TOKEN: "t" } as NodeJS.ProcessEnv)).not.toBeNull();
    expect(getStore({ KV_REST_API_URL: "https://a.io", KV_REST_API_TOKEN: "t" } as NodeJS.ProcessEnv)).not.toBeNull();
    expect(getStore({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBeNull();
    expect(getStore({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).not.toBeNull();
  });
});

describe("HTTP handlers", () => {
  beforeEach(() => {
    delete (globalThis as Record<string, unknown>).__sixtyMemoryStore;
  });

  const post = (body: unknown) =>
    collect(new Request("http://localhost/api/collect", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

  it("counts a valid interview and shows it in the tally", async () => {
    const res = await post(event());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ counted: true });

    const tally = await stats(new Request("http://localhost/api/stats"));
    const body = (await tally.json()) as { enabled: boolean; interviews: number };
    expect(body).toMatchObject({ enabled: true, interviews: 1 });
  });

  it("counts a repeat of the same interview once", async () => {
    await post(event());
    const again = await post(event());
    expect(await again.json()).toEqual({ counted: false });
    const body = (await (await stats(new Request("http://localhost/api/stats"))).json()) as { interviews: number };
    expect(body.interviews).toBe(1);
  });

  it("refuses junk, extra fields, unknown topics and the wrong method", async () => {
    expect((await post("not json")).status).toBe(400);
    expect((await post({ ...event(), transcript: "my answer" })).status).toBe(400);
    expect((await post(event({ topicId: "made-up-topic" }))).status).toBe(400);
    expect((await post("x".repeat(5000))).status).toBe(400);
    expect((await collect(new Request("http://localhost/api/collect"))).status).toBe(405);
    expect((await stats(new Request("http://localhost/api/stats", { method: "POST" }))).status).toBe(405);
  });

  it("says it is not configured, instead of faking a count, when there is no database in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const res = await post(event());
      expect(await res.json()).toEqual({ counted: false, reason: "not-configured" });
      const tally = (await (await stats(new Request("http://localhost/api/stats"))).json()) as { enabled: boolean };
      expect(tally.enabled).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
