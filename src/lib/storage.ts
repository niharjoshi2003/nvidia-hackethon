/**
 * Local persistence. One browser profile is one person; there is no account
 * and no server-side copy of any of this.
 *
 * Migrations exist from version 1 even though nothing has shipped yet. Adding
 * the table after data is in the wild is how people lose other people's
 * progress, and a migration path is far cheaper to add now than later.
 */

import { SCHEMA_VERSION, type AppState, type Settings } from "@/types";

export const STORAGE_KEY = "sixty.v1";

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  reduceMotion: false,
  timerSeconds: 60,
  planSize: 4,
  ownApiKey: "",
};

export function emptyState(): AppState {
  return {
    schemaVersion: SCHEMA_VERSION,
    attempts: [],
    progress: {},
    misses: [],
    notes: {},
    importedTopics: [],
    gradeStats: { attempted: 0, accepted: 0, rejected: 0, failed: 0 },
    settings: { ...DEFAULT_SETTINGS },
  };
}

/**
 * Each entry upgrades from its key version to the next one.
 * Keep them pure and total: a migration that throws locks a user out of their
 * own history with no way back.
 */
type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

const MIGRATIONS: Record<number, Migration> = {
  // 1: (state) => ({ ...state, schemaVersion: 2, newField: [] }),
};

export function migrate(raw: Record<string, unknown>): AppState {
  let state = raw;
  let version = typeof state.schemaVersion === "number" ? state.schemaVersion : 0;

  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) break;
    state = step(state);
    const next = typeof state.schemaVersion === "number" ? state.schemaVersion : version + 1;
    if (next <= version) break; // never loop forever on a buggy migration
    version = next;
  }

  return reconcile(state);
}

/**
 * Fill in anything missing so an older or hand-edited payload still loads.
 * Unknown-shaped data degrades to the default rather than crashing the app.
 */
function reconcile(state: Record<string, unknown>): AppState {
  const base = emptyState();
  const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const asRecord = <T,>(v: unknown): Record<string, T> =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, T>) : {};

  return {
    schemaVersion: SCHEMA_VERSION,
    attempts: asArray(state.attempts),
    progress: asRecord(state.progress),
    misses: asArray(state.misses),
    notes: asRecord(state.notes),
    importedTopics: asArray(state.importedTopics),
    gradeStats: { ...base.gradeStats, ...asRecord<number>(state.gradeStats) },
    settings: { ...base.settings, ...asRecord<unknown>(state.settings) } as Settings,
  };
}

export function loadState(): AppState {
  if (typeof localStorage === "undefined") return emptyState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return emptyState();
    return migrate(parsed as Record<string, unknown>);
  } catch {
    // Corrupt payload. Starting clean beats an app that will not boot; the bad
    // value is left in place so it can still be recovered by hand.
    return emptyState();
  }
}

export function saveState(state: AppState): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded or private mode. The session continues in memory.
  }
}
