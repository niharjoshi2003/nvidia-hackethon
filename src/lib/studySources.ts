import { z } from "zod";

export const STUDY_DOMAINS = [
  "docs.ragas.io", "docs.langchain.com", "docs.llamaindex.ai", "learn.microsoft.com",
  "docs.nvidia.com", "developer.nvidia.com", "docs.nebius.com", "nebius.com",
  "developers.openai.com", "platform.openai.com", "docs.anthropic.com",
  "docs.pinecone.io", "qdrant.tech", "redis.io", "docs.python.org", "developer.mozilla.org",
] as const;

export function isStudyUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      STUDY_DOMAINS.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
  } catch { return false; }
}

// Only public catalog identifiers and rubric lines; candidate text is rejected.
export const studyRequestSchema = z.object({
  topicId: z.string().min(1).max(100),
  rubricLine: z.string().min(1).max(400).optional(),
}).strict();

export const studyResponseSchema = z.object({
  provider: z.literal("tavily"),
  query: z.string().max(600),
  idea: z.string().max(400),
  retrievedAt: z.string(),
  cached: z.boolean(),
  requestId: z.string().max(200).nullable(),
  results: z.array(z.object({
    title: z.string().max(220),
    url: z.string().refine(isStudyUrl),
    content: z.string().max(500),
  })).max(3),
});
export type StudySourcesResult = z.infer<typeof studyResponseSchema>;

export async function fetchStudySources(
  request: z.infer<typeof studyRequestSchema>,
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch; endpoint?: string } = {},
): Promise<StudySourcesResult> {
  const response = await (options.fetchImpl ?? fetch)(options.endpoint ?? "/api/study", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(studyRequestSchema.parse(request)), signal: options.signal,
  });
  const raw: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = z.object({ detail: z.string().max(300) }).safeParse(raw);
    throw new Error(error.success ? error.data.detail : "Study sources could not be loaded. Please try again.");
  }
  const parsed = studyResponseSchema.safeParse(raw);
  if (!parsed.success) throw new Error("The search returned an unreadable result. Please try again.");
  return parsed.data;
}
