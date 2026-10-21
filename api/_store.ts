/**
 * The usage counter's storage.
 *
 * Two implementations behind one tiny interface:
 *
 *  - Upstash Redis over its REST API, when credentials are present. This is what
 *    runs on Vercel. It uses plain `fetch`, so there is no new dependency and
 *    nothing to bundle.
 *  - A small in-memory store, for `npm run dev` and for tests, so the counter
 *    works end to end without an account. It is never used in production: a
 *    serverless instance forgets everything, so on a host with no database the
 *    endpoints say "not configured" instead of quietly counting into the void.
 *
 * Files in /api that start with an underscore are not served as routes by Vercel,
 * which is why this helper can live next to the handlers.
 */

export type Command = (string | number)[];

export interface Store {
  /** Runs the commands in order and returns one result per command. */
  exec(commands: Command[]): Promise<unknown[]>;
}

// --- Upstash REST -----------------------------------------------------------------

const TIMEOUT_MS = 4000;

export function upstashStore(url: string, token: string): Store {
  const endpoint = `${url.replace(/\/$/, "")}/pipeline`;
  return {
    async exec(commands) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          signal: controller.signal,
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(commands),
        });
        if (!res.ok) throw new Error(`database returned HTTP ${res.status}`);
        const rows = (await res.json()) as { result?: unknown; error?: string }[];
        return rows.map((row) => {
          if (row.error) throw new Error(`database command failed: ${row.error}`);
          return row.result ?? null;
        });
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

// --- in memory (dev and tests) ------------------------------------------------------

/**
 * Implements only the commands the counter uses. Anything else throws, so the
 * counter cannot start relying on a command the fake does not model.
 */
export function memoryStore(): Store {
  const sets = new Map<string, Set<string>>();
  const hashes = new Map<string, Map<string, string>>();

  const hash = (key: string) => {
    let h = hashes.get(key);
    if (!h) hashes.set(key, (h = new Map()));
    return h;
  };

  const run = (cmd: Command): unknown => {
    const [name, key, ...rest] = cmd.map(String);
    switch (name?.toUpperCase()) {
      case "SADD": {
        let s = sets.get(key!);
        if (!s) sets.set(key!, (s = new Set()));
        let added = 0;
        for (const member of rest) {
          if (!s.has(member)) {
            s.add(member);
            added += 1;
          }
        }
        return added;
      }
      case "SCARD":
        return sets.get(key!)?.size ?? 0;
      case "HINCRBY": {
        const h = hash(key!);
        const next = Number(h.get(rest[0]!) ?? 0) + Number(rest[1]);
        h.set(rest[0]!, String(next));
        return next;
      }
      case "HINCRBYFLOAT": {
        const h = hash(key!);
        const next = Number(h.get(rest[0]!) ?? 0) + Number(rest[1]);
        h.set(rest[0]!, String(next));
        return String(next);
      }
      case "HGETALL": {
        const out: string[] = [];
        for (const [k, v] of hashes.get(key!) ?? []) out.push(k, v);
        return out;
      }
      default:
        throw new Error(`memory store does not implement ${name}`);
    }
  };

  return {
    exec: async (commands) => commands.map(run),
  };
}

// --- which one to use ---------------------------------------------------------------

const MEMORY_KEY = "__sixtyMemoryStore";

/**
 * The store for this process, or null when there is nowhere safe to keep counts.
 *
 * Upstash credentials come from either naming scheme: the ones Upstash documents,
 * and the KV_* ones Vercel adds when you connect the database from its dashboard.
 */
export function getStore(env: NodeJS.ProcessEnv = process.env): Store | null {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (url && token) return upstashStore(url, token);

  if (env.NODE_ENV === "production") return null;

  // Kept on globalThis so editing a handler during `npm run dev` does not wipe it.
  const g = globalThis as unknown as Record<string, Store | undefined>;
  return (g[MEMORY_KEY] ??= memoryStore());
}
