import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApp, stopTestApp, type TestContext } from "./setup.js";

describe("GET /v1/health", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await startTestApp();
  });

  afterAll(async () => {
    await stopTestApp(ctx);
  });

  it("returns 200 ready when Postgres and Redis are reachable", async () => {
    const response = await ctx.app.inject({ method: "GET", url: "/v1/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ready",
      checks: { postgres: "up", redis: "up" },
    });
  });
});
