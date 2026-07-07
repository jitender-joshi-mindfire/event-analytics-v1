import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { startTestApp, stopTestApp, type TestContext } from "./setup.js";
import { INGEST_RATE_LIMIT_MAX_PER_WINDOW, ingestRateLimitKey } from "../src/rateLimit/ingestRateLimiter.js";

const FIXTURE_USER_ID = "u_test_ratelimit_fixture";

describe("POST /v1/events rate limiting", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await startTestApp();
    await ctx.app.pg.query("DELETE FROM events WHERE user_id = $1", [FIXTURE_USER_ID]);
    await ctx.app.pg.query("DELETE FROM users WHERE user_id = $1", [FIXTURE_USER_ID]);
    await ctx.app.pg.query("INSERT INTO users (user_id, signup_at, country, plan) VALUES ($1, now(), 'us', 'free')", [
      FIXTURE_USER_ID,
    ]);
  });

  afterEach(async () => {
    await ctx.app.redis.del(ingestRateLimitKey());
  });

  afterAll(async () => {
    await ctx.app.pg.query("DELETE FROM events WHERE user_id = $1", [FIXTURE_USER_ID]);
    await ctx.app.pg.query("DELETE FROM users WHERE user_id = $1", [FIXTURE_USER_ID]);
    await stopTestApp(ctx);
  });

  it("returns 429 once the window's batch limit is exceeded", async () => {
    // Pre-load the counter to the limit instead of firing 120 real requests.
    await ctx.app.redis.set(ingestRateLimitKey(), INGEST_RATE_LIMIT_MAX_PER_WINDOW);

    const payload = {
      events: [
        {
          event_id: randomUUID(),
          user_id: FIXTURE_USER_ID,
          event_type: "login",
          occurred_at: "2026-04-01T00:00:00Z",
        },
      ],
    };

    const response = await ctx.app.inject({ method: "POST", url: "/v1/events", payload });

    expect(response.statusCode).toBe(429);
    const body = response.json();
    expect(body.status).toBe(429);
    expect(body.title).toBeTruthy();
  });

  it("allows requests under the limit", async () => {
    await ctx.app.redis.set(ingestRateLimitKey(), INGEST_RATE_LIMIT_MAX_PER_WINDOW - 2);

    const response = await ctx.app.inject({
      method: "POST",
      url: "/v1/events",
      payload: {
        events: [
          {
            event_id: randomUUID(),
            user_id: FIXTURE_USER_ID,
            event_type: "login",
            occurred_at: "2026-04-01T00:00:00Z",
          },
        ],
      },
    });

    expect(response.statusCode).toBe(202);
  });
});
