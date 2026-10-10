import { describe, expect, it } from "vitest";
import { migrate } from "./storage";
import { SCHEMA_VERSION } from "@/types";

describe("migrate", () => {
  it("upgrades a version 1 payload without losing misses, and adds labels and replay", () => {
    const state = migrate({
      schemaVersion: 1,
      misses: [{ id: "m1" }],
      settings: { theme: "dark", ownApiKey: "k" },
    });
    expect(state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(state.misses).toHaveLength(1);
    expect(state.labels).toEqual([]);
    expect(state.settings.replayMode).toBe(false);
    expect(state.settings.ownApiKey).toBe("k");
  });
});
