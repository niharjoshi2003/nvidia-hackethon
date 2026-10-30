import { z } from "zod";
import { seedTopics } from "../src/data/topics/index.js";
import { SHARED_CLAIMS } from "../src/data/topics/sharedClaims.js";
import { isStudyUrl, STUDY_DOMAINS, studyRequestSchema, type StudySourcesResult } from "../src/lib/studySources.js";

export const config = { runtime: "nodejs" };
export default { fetch: handler };

const cache = new Map<string, { until: number; result: StudySourcesResult }>();
const hits = new Map<string, number[]>();
let day = "";
let dayCount = 0;
const upstreamSchema = z.object({
  request_id: z.string().max(200).optional(),
  results: z.array(z.object({ title: z.string(), url: z.string(), content: z.string().default("") })).max(20),
});
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

export async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "method-not-allowed" });
  const text = await request.text();
  if (text.length > 2000) return json(400, { error: "bad-request" });
  let body: unknown;
  try { body = JSON.parse(text); } catch { return json(400, { error: "bad-request" }); }
  const parsed = studyRequestSchema.safeParse(body);
  if (!parsed.success) return json(400, { error: "bad-request", detail: "Choose a study topic from the question bank." });
  const topic = seedTopics.find((item) => item.id === parsed.data.topicId);
  if (!topic || (parsed.data.rubricLine && !topic.scaffold.keyPoints.includes(parsed.data.rubricLine))) {
    return json(400, { error: "unknown-idea", detail: "That study idea is not in this question's rubric." });
  }
  const idea = parsed.data.rubricLine ?? topic.title;
  const key = `${topic.id}:${idea}`;
  const now = Date.now();
  const saved = cache.get(key);
  if (saved && saved.until > now) return json(200, { ...saved.result, cached: true });
  // Accept the existing local/Vercel key name while documenting the standard name.
  const apiKey = (process.env.TAVILY_API_KEY || process.env.tavily_key)?.trim();
  if (!apiKey) return json(503, { error: "not-configured", detail: "Study-source search is not configured yet. Please try again later." });

  if (process.env.NODE_ENV === "production") {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const recent = (hits.get(ip) ?? []).filter((at) => at > now - 3_600_000);
    if (recent.length >= 12) return json(429, { error: "rate-limited", detail: "Study-source search is busy. Please try again later." });
    if (hits.size >= 512) hits.clear();
    hits.set(ip, [...recent, now]);
    const today = new Date(now).toISOString().slice(0, 10);
    if (day !== today) { day = today; dayCount = 0; }
    if (dayCount >= 200) return json(429, { error: "quota-reached", detail: "Today's study-source search budget is used up. Please try again tomorrow." });
    dayCount += 1;
  }

  // Built only from trusted public catalog text, never the user's answer.
  const focus = idea.split(/\s+because\s+/i)[0];
  const retrievalEvaluation = idea === SHARED_CLAIMS.retrievalEval;
  const query = retrievalEvaluation
    ? "RAG retrieval evaluation context precision context recall generation metrics"
    : `${focus}. ${idea === topic.title ? "" : topic.title + ". "}Technical documentation and practical examples.`;
  const domains = retrievalEvaluation ? ["docs.ragas.io", "docs.langchain.com", "docs.llamaindex.ai"] : STUDY_DOMAINS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST", signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query, topic: "general", search_depth: "basic", max_results: 3,
        include_domains: domains, include_answer: false, include_raw_content: false,
        include_images: false, auto_parameters: false,
      }),
    });
    if (!response.ok) return json(502, {
      error: "search-failed", detail: response.status === 429 || response.status === 432 || response.status === 433
        ? "Tavily's search quota is currently unavailable. Please try again later."
        : "Tavily could not complete this search. Please try again later.",
    });
    const upstream = upstreamSchema.safeParse(await response.json());
    if (!upstream.success) return json(502, { error: "invalid-search-response", detail: "The search response could not be read. Please try again." });
    const seen = new Set<string>();
    const results = upstream.data.results.filter((item) => {
      if (!isStudyUrl(item.url) || seen.has(item.url)) return false;
      seen.add(item.url); return true;
    }).slice(0, 3).map((item) => ({ title: item.title.slice(0, 220), url: item.url, content: item.content.slice(0, 500) }));
    const result: StudySourcesResult = {
      provider: "tavily", query, idea, retrievedAt: new Date().toISOString(), cached: false,
      requestId: upstream.data.request_id ?? null, results,
    };
    if (results.length) {
      if (cache.size >= 128) cache.delete(cache.keys().next().value!);
      cache.set(key, { until: now + 900_000, result });
    }
    return json(200, result);
  } catch {
    return json(502, { error: "search-unavailable", detail: "Study-source search timed out or could not connect. Please try again." });
  } finally { clearTimeout(timeout); }
}
