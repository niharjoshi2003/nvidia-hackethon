/**
 * Replay mode: serve saved responses through the same client path.
 *
 * The replay fetch stands in for /api/grade, so the citation gate, combine
 * step, and repair tag check all run exactly as they do live. Only the network
 * call is replaced. Every call it returns is marked provider "replay" and the
 * outcome is flagged, so the screen can never present a replay as live.
 */

import data from "@/data/replay.json";
import type { OutboundCall } from "@/types";
import { normalize } from "@/lib/text";

export interface ReplayRecording {
  topicId: string;
  transcript: string;
  rate?: {
    models: { extract: string | null; nano: string | null; ultra: string | null };
    extract: unknown;
    nano: unknown;
    ultra: unknown;
  };
  parallel: {
    models: { nano: string | null; ultra: string | null };
    nano: unknown;
    ultra: unknown;
  };
  repair: unknown;
}

export const REPLAY_SOURCE: "authored" | "recorded" =
  data.source === "recorded" ? "recorded" : "authored";

const recordings = data.recordings as ReplayRecording[];

export function replayFor(topicId: string): ReplayRecording | undefined {
  return recordings.find((r) => r.topicId === topicId);
}

export function hasReplay(topicId: string): boolean {
  return replayFor(topicId) !== undefined;
}

function call(model: string, purpose: OutboundCall["purpose"]): OutboundCall {
  return {
    at: new Date().toISOString(),
    provider: "replay",
    model,
    purpose,
    ms: 0,
    ok: true,
    promptTokens: null,
    completionTokens: null,
  };
}

const respond = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * A fetch for one topic. A transcript other than the saved one is refused:
 * replaying verdicts against words they were not produced for would be a
 * fabricated grade.
 */
export function replayFetch(topicId: string): typeof fetch {
  return (async (_url: RequestInfo | URL, init?: RequestInit) => {
    const recording = replayFor(topicId);
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      mode?: string;
      transcript?: string;
    };
    if (!recording) {
      return respond(404, { error: "replay-missing", detail: "No saved answer for this question." });
    }
    if (normalize(body.transcript) !== normalize(recording.transcript)) {
      return respond(409, {
        error: "replay-mismatch",
        detail: "Replay only grades the saved answer. Use the saved answer, or turn replay off.",
      });
    }

    const { models } = recording.parallel;
    if (body.mode === "rate") {
      const rated = recording.rate;
      if (!rated) {
        return respond(404, { error: "replay-missing", detail: "No saved rating for this question." });
      }
      return respond(200, {
        extract: rated.extract,
        nano: rated.nano,
        ultra: rated.ultra,
        models: rated.models,
        replay: true,
        calls: [
          call(`${rated.models.extract ?? "nano"}`, "extract"),
          call(`${rated.models.nano ?? "nano"}`, "rate-nano"),
          call(`${rated.models.ultra ?? "ultra"}`, "rate-ultra"),
        ],
      });
    }
    if (body.mode === "parallel") {
      return respond(200, {
        nano: recording.parallel.nano,
        ultra: recording.parallel.ultra,
        models,
        replay: true,
        calls: [
          call(`${models.nano ?? "nano"}`, "lines-nano"),
          call(`${models.ultra ?? "ultra"}`, "lines-ultra"),
        ],
      });
    }
    if (body.mode === "repair") {
      return respond(200, {
        repair: recording.repair,
        model: models.ultra ?? "ultra",
        replay: true,
        calls: [call(`${models.ultra ?? "ultra"}`, "repair")],
      });
    }
    return respond(400, { error: "bad-request", detail: "Replay serves the coach session only." });
  }) as typeof fetch;
}
