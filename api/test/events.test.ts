import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApp, stopTestApp, type TestContext } from "./setup.js";

const FIXTURE_USER_ID = "u_test_ingest_fixture";

describe("POST /v1/events", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await startTestApp();
    await ctx.app.pg.query("DELETE FROM events WHERE user_id = $1", [FIXTURE_USER_ID]);
    await ctx.app.pg.query("DELETE FROM users WHERE user_id = $1", [FIXTURE_USER_ID]);
    await ctx.app.pg.query(
      "INSERT INTO users (user_id, signup_at, country, plan) VALUES ($1, now(), 'us', 'free')",
      [FIXTURE_USER_ID]
    );
  });

  afterAll(async () => {
    await ctx.app.pg.query("DELETE FROM events WHERE user_id = $1", [FIXTURE_USER_ID]);
    await ctx.app.pg.query("DELETE FROM users WHERE user_id = $1", [FIXTURE_USER_ID]);
    await stopTestApp(ctx);
  });

  it("accepts a valid batch and is idempotent on re-send", async () => {
    const batch = {
      events: [
        {
          event_id: randomUUID(),
          user_id: FIXTURE_USER_ID,
          session_id: "s_test_1",
          event_type: "purchase",
          occurred_at: "2026-01-15T10:32:00Z",
          payload: { amount: 49.9, page: "/checkout" },
        },
      ],
    };

    const first = await ctx.app.inject({ method: "POST", url: "/v1/events", payload: batch });
    expect(first.statusCode).toBe(202);
    expect(first.json()).toEqual({ received: 1, accepted: 1, duplicates: 0 });

    const second = await ctx.app.inject({ method: "POST", url: "/v1/events", payload: batch });
    expect(second.statusCode).toBe(202);
    expect(second.json()).toEqual({ received: 1, accepted: 0, duplicates: 1 });
  });

  it("rejects a batch missing a required field with field-level errors", async () => {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/v1/events",
      payload: {
        events: [
          {
            event_id: randomUUID(),
            user_id: FIXTURE_USER_ID,
            // event_type omitted
            occurred_at: "2026-01-15T10:32:00Z",
          },
        ],
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.status).toBe(400);
    expect(body.title).toBeTruthy();
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it("rejects an event with an unknown property", async () => {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/v1/events",
      payload: {
        events: [
          {
            event_id: randomUUID(),
            user_id: FIXTURE_USER_ID,
            event_type: "login",
            occurred_at: "2026-01-15T10:32:00Z",
            unexpected_field: "nope",
          },
        ],
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("rejects a batch referencing an unknown user_id", async () => {
    const response = await ctx.app.inject({
      method: "POST",
      url: "/v1/events",
      payload: {
        events: [
          {
            event_id: randomUUID(),
            user_id: "u_does_not_exist_12345",
            event_type: "login",
            occurred_at: "2026-01-15T10:32:00Z",
          },
        ],
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.errors?.[0]?.message).toContain("u_does_not_exist_12345");
  });

  it("rejects an empty batch", async () => {
    const response = await ctx.app.inject({ method: "POST", url: "/v1/events", payload: { events: [] } });
    expect(response.statusCode).toBe(400);
  });
});
