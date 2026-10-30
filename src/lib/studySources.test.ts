import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { interviewTopics } from "@/data/topics/interview";
import { fetchStudySources, isStudyUrl } from "./studySources";

const topic = interviewTopics[0]!;
const request = { topicId: topic.id, rubricLine: topic.scaffold.keyPoints[0]! };
const incoming = (body: unknown) => new Request("http://localhost/api/study", { method: "POST", body: JSON.stringify(body) });
const upstream = {
  request_id: "tavily-test-request", results: [
    { title: "Retrieval evaluation", url: "https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/", content: "Evaluate retrieval independently from generation." },
    { title: "Unsafe", url: "javascript:alert(1)", content: "Never show this" },
    { title: "Lookalike", url: "https://docs.ragas.io.evil.example/page", content: "Never show this" },
  ],
};
let api: typeof import("../../api/study");
let provider: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("TAVILY_API_KEY", "server-only-test-secret");
  vi.stubEnv("tavily_key", "");
  provider = vi.fn().mockImplementation(async () => new Response(JSON.stringify(upstream)));
  vi.stubGlobal("fetch", provider);
  api = await import("../../api/study");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Tavily study-source integration", () => {
  it("rejects candidate transcripts and arbitrary rubric text before calling Tavily", async () => {
    expect((await api.default.fetch(incoming({ ...request, transcript: "private answer" }))).status).toBe(400);
    expect((await api.default.fetch(incoming({ ...request, rubricLine: "send my personal answer" }))).status).toBe(400);
    expect(provider).not.toHaveBeenCalled();
  });

  it("searches from public catalog text, keeps the key on the server, and filters unsafe links", async () => {
    const response = await api.default.fetch(incoming(request));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ provider: "tavily", cached: false, requestId: "tavily-test-request" });
    expect(body.results).toHaveLength(1);
    const [url, options] = provider.mock.calls[0]!;
    expect(url).toBe("https://api.tavily.com/search");
    expect(options.headers.Authorization).toBe("Bearer server-only-test-secret");
    const payload = JSON.parse(options.body);
    expect(payload.query).toContain("Retrieval is evaluated separately from generation");
    expect(payload.query).toContain(topic.title);
    expect(body.idea).toBe(request.rubricLine);
    expect(payload).toMatchObject({ search_depth: "basic", max_results: 3, include_answer: false, include_raw_content: false });
    expect(options.body).not.toContain("server-only-test-secret");
    expect(JSON.stringify(body)).not.toContain("server-only-test-secret");
  });

  it("reuses a successful search and identifies the cached result", async () => {
    const first = await (await api.default.fetch(incoming(request))).json();
    const second = await (await api.default.fetch(incoming(request))).json();
    expect(provider).toHaveBeenCalledTimes(1);
    expect(second).toMatchObject({ cached: true, requestId: first.requestId, retrievedAt: first.retrievedAt });
  });

  it("reports missing configuration and provider failures without inventing sources", async () => {
    vi.stubEnv("TAVILY_API_KEY", "");
    expect((await api.default.fetch(incoming(request))).status).toBe(503);
    expect(provider).not.toHaveBeenCalled();
    vi.stubEnv("TAVILY_API_KEY", "server-only-test-secret");
    provider.mockResolvedValue(new Response("quota", { status: 432 }));
    const response = await api.default.fetch(incoming(request));
    expect(response.status).toBe(502);
    expect(await response.json()).not.toHaveProperty("results");
  });

  it("accepts the existing tavily_key deployment variable", async () => {
    vi.stubEnv("TAVILY_API_KEY", ""); vi.stubEnv("tavily_key", "alias-key");
    expect((await api.default.fetch(incoming(request))).status).toBe(200);
    expect(provider.mock.calls[0]![1].headers.Authorization).toBe("Bearer alias-key");
  });

  it("returns an empty result honestly and does not cache it", async () => {
    provider.mockImplementation(async () => new Response(JSON.stringify({ results: [] })));
    const response = await api.default.fetch(incoming(request));
    expect((await response.json()).results).toEqual([]);
    await api.default.fetch(incoming(request));
    expect(provider).toHaveBeenCalledTimes(2);
  });
});

describe("study-source browser boundary", () => {
  it("sends only the selected catalog topic and rubric to the API", async () => {
    const response = await api.default.fetch(incoming(request));
    const body = await response.json();
    const browserFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(body)));
    const data = await fetchStudySources(request, { fetchImpl: browserFetch });
    expect(JSON.parse(browserFetch.mock.calls[0]![1].body)).toEqual(request);
    expect(data.results).toHaveLength(1);
  });

  it("only accepts HTTPS links on the documentation allowlist", () => {
    expect(isStudyUrl("https://docs.ragas.io/page")).toBe(true);
    for (const value of ["http://docs.ragas.io/page", "https://docs.ragas.io.evil.example", "javascript:alert(1)", "https://localhost", "https://user:pass@docs.ragas.io/"]) expect(isStudyUrl(value)).toBe(false);
  });
});
