/**
 * The only networked part of sixty.
 *
 * Holds the Nebius Token Factory credential and runs the two Nemotron calls.
 * Everything else — audio, transcripts, progress, the miss log — stays in the
 * browser. This function is stateless and deliberately forgetful: it logs no
 * transcript and stores no result.
 *
 * Two design constraints worth stating up front:
 *
 *  1. It accepts a rubric and a transcript, never raw chat messages. A leaked
 *     URL therefore cannot be used as a general-purpose model proxy on the
 *     project's hackathon credits.
 *  2. It returns the models' raw output plus call metadata, and does NOT
 *     decide whether the grade is acceptable. The citation gate runs in the
 *     browser against the transcript the user actually has, so the check
 *     cannot be quietly skipped by a server that wants to look successful.
 */

import { z } from "zod";
import { validateCoverage } from "../src/agent/gradeSchema";
import {
  COVERAGE_SYSTEM,
  JUDGMENT_SYSTEM,
  coverageUser,
  judgmentUser,
  type GradeRequest,
} from "../src/agent/prompts";

export const config = { runtime: "nodejs" };

// --- request ----------------------------------------------------------------

const MAX_TRANSCRIPT_CHARS = 6000;

const requestSchema = z.object({
  transcript: z.string().trim().min(1).max(MAX_TRANSCRIPT_CHARS),
  keyPoints: z.array(z.string().max(400)).min(1).max(12),
  gotchas: z.array(z.string().max(400)).max(8),
  modelAnswerLines: z.array(z.string().max(400)).max(10),
});

// --- budget protection ------------------------------------------------------

/**
 * In-process counters.
 *
 * Honest limitation: serverless instances do not share memory, so the real
 * ceiling is this number times the number of warm instances. For a demo with
 * roughly $50 of credits that is a large enough reduction in blast radius to
 * matter, and it needs no external dependency. A shared store would be the
 * right answer for anything beyond a hackathon, and the README says so.
 */
const RATE_LIMIT = Number(process.env.GRADE_RATE_LIMIT_PER_HOUR || 10);
const DAILY_CAP = Number(process.env.GRADE_DAILY_CAP || 400);

const hits = new Map<string, number[]>();
let dayStamp = new Date().toISOString().slice(0, 10);
let dayCount = 0;

function overDailyCap(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dayStamp) {
    dayStamp = today;
    dayCount = 0;
  }
  return dayCount >= DAILY_CAP;
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;
  const recent = (hits.get(ip) ?? []).filter((t) => t > hourAgo);
  if (recent.length >= RATE_LIMIT) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

// --- token factory ----------------------------------------------------------

const BASE_URL = (
  process.env.TOKEN_FACTORY_BASE_URL ||
  "https://api.tokenfactory.us-central1.nebius.com/v1"
).replace(/\/$/, "");

const CALL_TIMEOUT_MS = 20_000;

interface CallRecord {
  at: string;
  provider: "token-factory";
  model: string;
  purpose: "coverage" | "judgment";
  ms: number;
  ok: boolean;
  promptTokens: number | null;
  completionTokens: number | null;
  error?: string;
}

interface CallResult {
  record: CallRecord;
  parsed: unknown;
}

interface ModelOptions {
  /** Caps the completion, including any reasoning tokens the model still emits. */
  maxTokens: number;
  /**
   * Coverage is a classification, and Nemotron's hidden reasoning both blew the
   * latency budget and collapsed the labels. Judgment keeps reasoning on.
   */
  disableThinking?: boolean;
}

async function callModel(
  apiKey: string,
  model: string,
  purpose: "coverage" | "judgment",
  system: string,
  user: string,
  options: ModelOptions,
): Promise<CallResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);

  const base: CallRecord = {
    at: new Date().toISOString(),
    provider: "token-factory",
    model,
    purpose,
    ms: 0,
    ok: false,
    promptTokens: null,
    completionTokens: null,
  };

  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: options.maxTokens,
        response_format: { type: "json_object" },
        ...(options.disableThinking
          ? { chat_template_kwargs: { enable_thinking: false } }
          : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    const ms = Date.now() - started;
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;

    if (!res.ok) {
      return {
        record: { ...base, ms, error: extractError(body, res.status) },
        parsed: null,
      };
    }

    const usage = (body?.usage ?? null) as Record<string, number> | null;
    const content =
      (body as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message
        ?.content ?? "";

    return {
      record: {
        ...base,
        ms,
        ok: true,
        promptTokens: usage?.prompt_tokens ?? null,
        completionTokens: usage?.completion_tokens ?? null,
      },
      parsed: parseLooseJson(content),
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      record: {
        ...base,
        ms: Date.now() - started,
        error: aborted ? "timeout after 20s" : String(error),
      },
      parsed: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One retry when the model answered but the JSON did not parse. HTTP errors
 * and timeouts are not retried: they cost the same again and rarely recover.
 * Both attempts are recorded, so the trace shows the retry.
 */
async function callModelWithRetry(
  calls: CallRecord[],
  ...args: Parameters<typeof callModel>
): Promise<CallResult> {
  const first = await callModel(...args);
  calls.push(first.record);
  if (!first.record.ok || first.parsed !== null) return first;

  first.record.error = "unparseable JSON, retried";
  const second = await callModel(...args);
  calls.push(second.record);
  return second;
}

function extractError(body: unknown, status: number): string {
  const b = body as { error?: { message?: string }; message?: string } | null;
  return b?.error?.message || b?.message || `HTTP ${status}`;
}

/** Models occasionally wrap JSON in a markdown fence even in JSON mode. */
function parseLooseJson(text: string): unknown {
  if (!text) return null;
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

// --- handler ----------------------------------------------------------------

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return json(405, { error: "method-not-allowed" });

  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return json(400, { error: "bad-request", detail: parsed.error.issues[0]?.message });
  }

  // A user-supplied key bypasses the shared budget entirely. It is read from
  // the header, used for this request, and never persisted.
  const ownKey = req.headers.get("x-token-factory-key")?.trim();
  const apiKey = ownKey || process.env.TOKEN_FACTORY_API_KEY;
  if (!apiKey) return json(500, { error: "not-configured" });

  if (!ownKey) {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    if (rateLimited(ip)) {
      return json(429, {
        error: "rate-limited",
        detail: `The shared demo allows ${RATE_LIMIT} grades an hour. Add your own Token Factory key in Settings to keep going.`,
      });
    }
    if (overDailyCap()) {
      return json(429, {
        error: "quota-reached",
        detail:
          "The shared demo budget for today is spent. Add your own Token Factory key in Settings to keep going.",
      });
    }
    dayCount += 1;
  }

  const nano = process.env.NEMOTRON_NANO;
  const ultra = process.env.NEMOTRON_ULTRA;
  if (!nano || !ultra) return json(500, { error: "models-not-configured" });

  const request: GradeRequest = parsed.data;
  const calls: CallRecord[] = [];

  // Stage 1, cheap pass: which key points were covered.
  const coverage = await callModelWithRetry(
    calls,
    apiKey,
    nano,
    "coverage",
    COVERAGE_SYSTEM,
    coverageUser(request),
    { maxTokens: 900, disableThinking: true },
  );
  if (!coverage.record.ok) {
    return json(502, { error: "coverage-error", detail: coverage.record.error, calls });
  }

  // Stage 2, judgment: one miss, cited. Stage 1's skipped list is a hint only,
  // and only the points whose evidence survived the same check the browser runs.
  const skipped = validateCoverage(
    coverage.parsed,
    request.keyPoints,
    request.transcript,
  ).skipped;

  const judgment = await callModelWithRetry(
    calls,
    apiKey,
    ultra,
    "judgment",
    JUDGMENT_SYSTEM,
    judgmentUser(request, skipped),
    { maxTokens: 4000 },
  );
  if (!judgment.record.ok) {
    return json(502, { error: "judgment-error", detail: judgment.record.error, calls });
  }

  // Raw output. The browser runs the citation gate over this.
  return json(200, {
    coverage: coverage.parsed,
    judgment: judgment.parsed,
    models: { coverage: nano, judgment: ultra },
    calls,
  });
}
