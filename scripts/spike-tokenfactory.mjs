#!/usr/bin/env node
/**
 * Phase 0, Spike 1 — Token Factory / Nemotron feasibility gate.
 *
 * Throwaway diagnostic, not product code. Answers the four questions that the
 * whole architecture rests on, before any of it is built:
 *
 *   1. Which Nemotron model ids does Token Factory actually serve?
 *   2. Does each tier honor structured JSON output?
 *   3. What is the latency of one grade (Nano coverage pass + Ultra judgment)?
 *   4. What does one grade cost, and how many fit in the credit budget?
 *
 * Also reports any ASR models on the catalog, which decides Spike 2.
 *
 * Run:  node scripts/spike-tokenfactory.mjs
 * Needs: TOKEN_FACTORY_API_KEY in the environment or in .env
 */

import { readFileSync } from "node:fs";

// --- config -----------------------------------------------------------------

loadDotEnv();

const API_KEY = process.env.TOKEN_FACTORY_API_KEY || process.env.NEBIUS_API_KEY;
const BASE_URL = (
  process.env.TOKEN_FACTORY_BASE_URL ||
  "https://api.tokenfactory.us-central1.nebius.com/v1"
).replace(/\/$/, "");

// Optional. If you know your plan's prices, set these and the script reports
// cost per grade and grades-per-budget instead of raw token counts.
const PRICE_IN = Number(process.env.PRICE_PER_1M_INPUT || 0);
const PRICE_OUT = Number(process.env.PRICE_PER_1M_OUTPUT || 0);
const BUDGET_USD = Number(process.env.CREDIT_BUDGET_USD || 50);

const REQUEST_TIMEOUT_MS = 60_000;

if (!API_KEY) {
  console.error(
    "TOKEN_FACTORY_API_KEY is not set.\n" +
      "Put it in .env as TOKEN_FACTORY_API_KEY=... (.env is gitignored) and re-run.",
  );
  process.exit(1);
}

// --- the fixture we grade ---------------------------------------------------
// A deliberately incomplete answer: it covers retries and backoff, and never
// mentions the idempotency key. A working pipeline must find exactly that.

const RUBRIC = {
  topic: "Retries and exactly-once effects in a payments API",
  keyPoints: [
    "Retries must be paired with an idempotency key so a replayed request does not charge twice",
    "Use exponential backoff with jitter to avoid synchronized retry storms",
    "Distinguish retriable errors (5xx, timeouts) from terminal ones (4xx validation)",
    "Bound total retry attempts and surface a terminal failure to the caller",
    "The idempotency key must be stored with the result so a replay returns the original response",
    "Network timeouts are ambiguous: the write may have succeeded, so a retry must be safe",
  ],
  gotchas: [
    "Treating a timeout as a definite failure and re-issuing an unguarded write",
    "Generating a fresh idempotency key on each retry, which defeats the mechanism",
  ],
};

const TRANSCRIPT =
  "So when a payment call fails I would retry it. I'd use exponential backoff " +
  "with some jitter so that if a lot of clients fail at once they don't all " +
  "come back at the same moment and knock the service over again. I'd cap it " +
  "at something like five attempts and then give up and return an error to the " +
  "caller. I'd also only retry on five hundreds and timeouts, because if it's a " +
  "four hundred that's a validation problem and retrying it is just going to " +
  "fail the same way every time. And I'd log each attempt so we can see the " +
  "retry rate in metrics.";

// --- prompts (mirrors of the real two-stage pipeline) -----------------------

const NANO_SYSTEM =
  "You classify which rubric key points a spoken answer covered. " +
  "Return JSON with one field, items: one entry per supplied key point, each with " +
  "point, status, and evidence. point MUST be copied verbatim from the supplied key points. " +
  'status is exactly "covered" or "skipped". When covered, evidence MUST be a short fragment ' +
  "copied verbatim from the transcript that states that point. When skipped, evidence is empty. " +
  "A point is covered only when the transcript states that point's own idea. " +
  "Do not invent, merge, or rewrite points. Every supplied key point appears exactly once.";

const nanoUser = () =>
  `KEY POINTS:\n${RUBRIC.keyPoints.map((p) => `- ${p}`).join("\n")}\n\n` +
  `TRANSCRIPT:\n${TRANSCRIPT}\n\n` +
  `Return JSON: {"items":[{"point": string, "status": "covered" | "skipped", "evidence": string}]}`;

const ULTRA_SYSTEM =
  "You name the single most important thing a spoken answer missed. " +
  "The quote MUST be copied verbatim from the transcript. " +
  "The rubricLine MUST be copied verbatim from the supplied rubric. " +
  "Do not paraphrase either. Do not give study tips.";

const ultraUser = (nano) =>
  `RUBRIC KEY POINTS:\n${RUBRIC.keyPoints.map((p) => `- ${p}`).join("\n")}\n\n` +
  `RUBRIC GOTCHAS:\n${RUBRIC.gotchas.map((g) => `- ${g}`).join("\n")}\n\n` +
  `ALREADY JUDGED COVERED:\n${(nano?.covered || []).map((c) => `- ${c}`).join("\n") || "- (none)"}\n\n` +
  `TRANSCRIPT:\n${TRANSCRIPT}\n\n` +
  `Return JSON: {"missType": string, "quote": string, "rubricLine": string, "plainLanguage": string}`;

// --- http -------------------------------------------------------------------

async function api(path, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function chat(model, system, user, { jsonMode, thinking = true, maxTokens = 4000 }) {
  const started = Date.now();
  const payload = {
    model,
    temperature: 0,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  if (jsonMode) payload.response_format = { type: "json_object" };
  // Coverage is a classification. Leaving Nemotron's hidden reasoning on both
  // blew the latency budget and collapsed every label to the same answer.
  if (!thinking) payload.chat_template_kwargs = { enable_thinking: false };

  const { ok, status, body } = await api("/chat/completions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const ms = Date.now() - started;

  if (!ok) {
    return { ok: false, ms, status, error: errorMessage(body) };
  }
  const content = body?.choices?.[0]?.message?.content ?? "";
  return { ok: true, ms, status, content, usage: body?.usage ?? null };
}

function errorMessage(body) {
  return (
    body?.error?.message ||
    body?.message ||
    body?.detail ||
    (body?.raw ? String(body.raw).slice(0, 300) : JSON.stringify(body).slice(0, 300))
  );
}

/** Models sometimes wrap JSON in a markdown fence even in JSON mode. */
function parseLooseJson(text) {
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

// --- the gate that makes this project different -----------------------------

const normalize = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

/** Same rule as the browser gate: a covered point needs a real transcript quote. */
function groundedCoverage(parsed) {
  const items = Array.isArray(parsed?.items) ? parsed.items : null;
  if (!items) return { covered: parsed?.covered || [], skipped: parsed?.skipped || [], invented: [] };

  const covered = [];
  const skipped = [];
  const invented = [];
  for (const item of items) {
    const point = RUBRIC.keyPoints.find((p) => normalize(p) === normalize(item?.point));
    if (!point) {
      if (item?.point) invented.push(item.point);
      continue;
    }
    const quote = normalize(item?.evidence);
    const grounded = String(item?.status).toLowerCase() === "covered" && quote && normalize(TRANSCRIPT).includes(quote);
    (grounded ? covered : skipped).push(point);
  }
  return { covered, skipped, invented };
}

function checkCitations(miss) {
  const rubricLines = [...RUBRIC.keyPoints, ...RUBRIC.gotchas];
  const quoteGrounded = normalize(TRANSCRIPT).includes(normalize(miss?.quote));
  const rubricGrounded = rubricLines.some(
    (line) => normalize(line) === normalize(miss?.rubricLine),
  );
  return { quoteGrounded, rubricGrounded };
}

// --- steps ------------------------------------------------------------------

async function listModels() {
  section("1. Model catalog");
  const { ok, status, body } = await api("/models");
  if (!ok) {
    console.log(`  FAILED (HTTP ${status}): ${errorMessage(body)}`);
    console.log("  Check the key and the base URL before going further.");
    return null;
  }
  const ids = (body?.data ?? []).map((m) => m.id).sort();
  console.log(`  ${ids.length} models visible on ${BASE_URL}`);

  const nemotron = ids.filter((id) => /nemotron/i.test(id));
  const asr = ids.filter((id) => /whisper|parakeet|canary|asr|speech|audio/i.test(id));

  console.log(`\n  Nemotron (${nemotron.length}):`);
  nemotron.forEach((id) => console.log(`    ${id}`));
  if (!nemotron.length) {
    console.log("    NONE. Hard blocker for requirement 2 of the hackathon rules.");
  }

  console.log(`\n  ASR candidates (${asr.length}) — decides Spike 2:`);
  if (asr.length) {
    asr.forEach((id) => console.log(`    ${id}`));
    console.log("    If one of these is an NVIDIA ASR model, server-side");
    console.log("    transcription gives you a second NVIDIA model in the submission.");
  } else {
    console.log("    None. Spike 2 falls to in-browser Whisper or Web Speech.");
  }
  return { ids, nemotron };
}

/**
 * Picks the smallest and largest Nemotron by the size hint in the id, so the
 * two tiers are chosen from what is really served rather than guessed.
 */
function pickTiers(nemotron) {
  if (!nemotron?.length) return null;
  const sized = nemotron.map((id) => {
    const b = id.match(/(\d+(?:\.\d+)?)\s*b/i);
    let size = b ? Number(b[1]) : null;
    if (size === null) {
      if (/nano/i.test(id)) size = 9;
      else if (/mini|small/i.test(id)) size = 30;
      else if (/super/i.test(id)) size = 50;
      else if (/ultra/i.test(id)) size = 253;
      else size = 100;
    }
    return { id, size };
  });
  sized.sort((a, b) => a.size - b.size);
  const nano = process.env.NEMOTRON_NANO || sized[0].id;
  const ultra = process.env.NEMOTRON_ULTRA || sized[sized.length - 1].id;
  return { nano, ultra, sameModel: nano === ultra };
}

async function probeJsonMode(model) {
  const withMode = await chat(model, NANO_SYSTEM, nanoUser(), {
    jsonMode: true,
    thinking: false,
    maxTokens: 900,
  });
  if (withMode.ok) {
    const parsed = parseLooseJson(withMode.content);
    return {
      supported: true,
      parsed: Boolean(parsed),
      result: withMode,
      note: parsed ? "json_object honored and parsed" : "accepted but output did not parse",
    };
  }
  const without = await chat(model, NANO_SYSTEM, nanoUser(), {
    jsonMode: false,
    thinking: false,
    maxTokens: 900,
  });
  return {
    supported: false,
    parsed: Boolean(parseLooseJson(without.content)),
    result: without,
    note: `json_object rejected (${withMode.error}); prompt-only JSON ${without.ok ? "works" : "also failed"}`,
  };
}

async function runGrade(tiers) {
  section("2. Structured output support");
  const nanoMode = await probeJsonMode(tiers.nano);
  console.log(`  ${tiers.nano}`);
  console.log(`    ${nanoMode.note}`);

  const useJsonMode = nanoMode.supported;
  if (!useJsonMode) {
    console.log("\n  CONSEQUENCE: the endpoint needs a fenced-JSON parser and a");
    console.log("  stricter retry. Budget an extra half day in Phase 3.");
  }

  section("3. One full grade (Nano coverage pass, then Ultra judgment)");

  const nano = nanoMode.result.ok
    ? nanoMode.result
    : await chat(tiers.nano, NANO_SYSTEM, nanoUser(), {
        jsonMode: useJsonMode,
        thinking: false,
        maxTokens: 900,
      });
  if (!nano.ok) {
    console.log(`  Nano FAILED (HTTP ${nano.status}): ${nano.error}`);
    return null;
  }
  const nanoJson = groundedCoverage(parseLooseJson(nano.content));
  console.log(`  Nano  ${tiers.nano}`);
  console.log(`    ${nano.ms} ms, ${tokenSummary(nano.usage)}`);
  console.log(`    covered: ${nanoJson.covered.length}, skipped: ${nanoJson.skipped.length}`);
  const backoffCovered = nanoJson.covered.some((line) => /backoff/i.test(line));
  const idempotencySkipped = nanoJson.skipped.some((line) => /idempotency key so a replayed/i.test(line));
  console.log(
    `    split (backoff covered, planted idempotency skipped): ${backoffCovered && idempotencySkipped ? "PASS" : "FAIL"}`,
  );
  console.log(
    nanoJson.invented.length
      ? `    WARNING: ${nanoJson.invented.length} string(s) not copied from the rubric — the verbatim constraint is not holding`
      : `    all strings copied verbatim from the rubric`,
  );

  const ultra = await chat(tiers.ultra, ULTRA_SYSTEM, ultraUser(nanoJson), {
    jsonMode: useJsonMode,
  });
  if (!ultra.ok) {
    console.log(`\n  Ultra FAILED (HTTP ${ultra.status}): ${ultra.error}`);
    return null;
  }
  const miss = parseLooseJson(ultra.content);
  console.log(`\n  Ultra ${tiers.ultra}`);
  console.log(`    ${ultra.ms} ms, ${tokenSummary(ultra.usage)}`);
  if (miss) {
    console.log(`    missType   : ${miss.missType}`);
    console.log(`    rubricLine : ${truncate(miss.rubricLine, 90)}`);
    console.log(`    quote      : ${truncate(miss.quote, 90)}`);
  } else {
    console.log(`    output did not parse as JSON`);
  }

  section("4. Citation gate (the core of the project, tested early)");
  const { quoteGrounded, rubricGrounded } = checkCitations(miss || {});
  console.log(`  quote is verbatim from transcript : ${quoteGrounded ? "PASS" : "FAIL"}`);
  console.log(`  rubricLine is verbatim from rubric: ${rubricGrounded ? "PASS" : "FAIL"}`);
  const foundIdempotency = /idempot/i.test(miss?.rubricLine || "");
  console.log(`  found the planted omission        : ${foundIdempotency ? "PASS" : "FAIL"}`);
  if (!quoteGrounded || !rubricGrounded) {
    console.log("\n  The models paraphrase under these prompts. That is survivable —");
    console.log("  the gate rejects it — but a high rejection rate needs prompt work");
    console.log("  in Phase 3 before the evaluation in Phase 5.");
  }

  return { nano, ultra, totalMs: nano.ms + ultra.ms };
}

function report(grade) {
  section("5. Budget");
  const inTok = (grade.nano.usage?.prompt_tokens || 0) + (grade.ultra.usage?.prompt_tokens || 0);
  const outTok =
    (grade.nano.usage?.completion_tokens || 0) + (grade.ultra.usage?.completion_tokens || 0);

  console.log(`  latency per grade : ${grade.totalMs} ms  (gate: under 8000 ms median)`);
  console.log(`  tokens per grade  : ${inTok} in, ${outTok} out`);

  if (PRICE_IN > 0 || PRICE_OUT > 0) {
    const cost = (inTok / 1e6) * PRICE_IN + (outTok / 1e6) * PRICE_OUT;
    console.log(`  cost per grade    : $${cost.toFixed(5)}`);
    console.log(`  grades in $${BUDGET_USD}   : ~${Math.floor(BUDGET_USD / cost).toLocaleString()}`);
    if (BUDGET_USD / cost < 300) {
      console.log("\n  TIGHT. Shorten the Ultra prompt or lower the public demo cap.");
    }
  } else {
    console.log("  cost per grade    : set PRICE_PER_1M_INPUT and PRICE_PER_1M_OUTPUT");
    console.log("                      from the Token Factory pricing page and re-run.");
  }

  if (grade.totalMs > 8000) {
    console.log("\n  Over the 8s latency gate. Options: stream the Nano result into the");
    console.log("  UI first, shorten the Ultra prompt, or drop the Ultra tier one size.");
  }
}

// --- helpers ----------------------------------------------------------------

function tokenSummary(usage) {
  if (!usage) return "usage not reported";
  return `${usage.prompt_tokens ?? "?"} in / ${usage.completion_tokens ?? "?"} out`;
}

const truncate = (s, n) =>
  !s ? "(missing)" : String(s).length > n ? `${String(s).slice(0, n)}...` : String(s);

function section(title) {
  console.log(`\n${"-".repeat(74)}\n${title}\n${"-".repeat(74)}`);
}

function loadDotEnv() {
  try {
    for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (!m) continue;
      const key = m[1];
      if (process.env[key] !== undefined) continue;
      process.env[key] = (m[2] || "").replace(/^(['"])(.*)\1$/, "$2").trim();
    }
  } catch {
    // no .env, rely on the real environment
  }
}

// --- main -------------------------------------------------------------------

console.log(`Token Factory spike — ${BASE_URL}`);

const catalog = await listModels();
if (!catalog) process.exit(1);

const tiers = pickTiers(catalog.nemotron);
if (!tiers) {
  console.log("\nNo Nemotron models served. Stop and resolve this before building.");
  process.exit(1);
}
console.log(`\n  Tiers chosen for this run:`);
console.log(`    cheap pass : ${tiers.nano}`);
console.log(`    judgment   : ${tiers.ultra}`);
if (tiers.sameModel) {
  console.log("    NOTE: only one tier available, so the two-stage split is not");
  console.log("    testable here. Override with NEMOTRON_NANO / NEMOTRON_ULTRA.");
}

const grade = await runGrade(tiers);
if (!grade) {
  console.log("\nGate NOT passed. Fix the failure above before Phase 1.");
  process.exit(1);
}
report(grade);

section("Record these in docs/evaluation.md");
console.log(`  nano  = ${tiers.nano}`);
console.log(`  ultra = ${tiers.ultra}`);
console.log(`  latency/grade = ${grade.totalMs} ms`);
console.log("\nGate passed. Phase 1 can start.\n");
