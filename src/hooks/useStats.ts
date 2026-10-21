import { useEffect, useState } from "react";
import type { PublicStats } from "@/lib/telemetrySchema";

export type StatsState =
  | { status: "loading" }
  /** No database is set up, or the request failed. The UI shows nothing in either case. */
  | { status: "off" }
  | { status: "ready"; stats: PublicStats };

/** Reads the public tally once. Never throws and never blocks the page. */
export function useStats(fetchImpl: typeof fetch = fetch): StatsState {
  const [state, setState] = useState<StatsState>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetchImpl("/api/stats", { cache: "no-store" });
        const body = (await res.json()) as PublicStats;
        if (!alive) return;
        setState(res.ok && body.enabled ? { status: "ready", stats: body } : { status: "off" });
      } catch {
        if (alive) setState({ status: "off" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [fetchImpl]);

  return state;
}
