import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApp, stopTestApp, type TestContext } from "./setup.js";

const FIXTURE_USER_ID = "u_test_concurrency_fixture";

describe("ingest concurrency", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await startTestApp();
    await ctx.app.pg.query("DELETE FROM events WHERE user_id = $1", [FIXTURE_USER_ID]);
    await ctx.app.pg.query("DELETE FROM users WHERE user_id = $1", [FIXTURE_USER_ID]);
    await ctx.app.pg.query("INSERT INTO users (user_id, signup_at, country, plan) VALUES ($1, now(), 'us', 'free')", [
      FIXTURE_USER_ID,
    ]);
  });

  afterAll(async () => {
    await ctx.app.pg.query("DELETE FROM events WHERE user_id = $1", [FIXTURE_USER_ID]);
    await ctx.app.pg.query("DELETE FROM users WHERE user_id = $1", [FIXTURE_USER_ID]);
    await stopTestApp(ctx);
  });

  it("a large batch ingest does not stall a concurrent read", async () => {
    const bigBatch = {
      events: Array.from({ length: 5000 }, (_, i) => ({
        event_id: randomUUID(),
        user_id: FIXTURE_USER_ID,
        event_type: "view_page",
        occurred_at: new Date(Date.UTC(2026, 6, 1) + i * 1000).toISOString(),
      })),
    };

    // Fire the large ingest without awaiting it, so it's genuinely in flight
    // (its DB round-trip pending) while we measure an unrelated read below.
    // A synchronous/blocking implementation would make the read wait behind it.
    const ingestPromise = ctx.app.inject({ method: "POST", url: "/v1/events", payload: bigBatch });

    const readStart = Date.now();
    const readResponse = await ctx.app.inject({ method: "GET", url: "/v1/health" });
    const readElapsedMs = Date.now() - readStart;

    const ingestResponse = await ingestPromise;

    expect(readResponse.statusCode).toBe(200);
    expect(ingestResponse.statusCode).toBe(202);
    expect(ingestResponse.json().accepted).toBe(5000);

    // A trivial health check should still be near-instant even with a 5000-row
    // insert in flight on the same event loop; a generous bound to absorb
    // sandbox/CI noise while still catching genuine event-loop blocking.
    expect(readElapsedMs).toBeLessThan(200);
  });
});
