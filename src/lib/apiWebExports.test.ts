import { describe, expect, it } from "vitest";
import grade from "../../api/grade";
import collect from "../../api/collect";
import stats from "../../api/stats";

describe("deployed Web handler entry points", () => {
  it("rejects a malformed grade through the Web fetch export before calling a model", async () => {
    const result = await grade.fetch(new Request("http://localhost/api/grade", { method: "POST", body: "{}" }));
    expect(result.status).toBe(400);
    expect(await result.json()).toMatchObject({ error: "bad-request" });
  });

  it("rejects the wrong method on each deployed entry point", async () => {
    expect((await grade.fetch(new Request("http://localhost/api/grade"))).status).toBe(405);
    expect((await collect.fetch(new Request("http://localhost/api/collect"))).status).toBe(405);
    expect((await stats.fetch(new Request("http://localhost/api/stats", { method: "POST" }))).status).toBe(405);
  });
});
