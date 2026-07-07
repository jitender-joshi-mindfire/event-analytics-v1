import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApp, stopTestApp, type TestContext } from "./setup.js";

const USERS = ["u_test_funnel_1", "u_test_funnel_2", "u_test_funnel_3", "u_test_funnel_4"];

interface EventFixture {
  user_id: string;
  event_type: string;
  occurred_at: string;
}

async function insertEvents(ctx: TestContext, events: EventFixture[]): Promise<void> {
  for (const e of events) {
    await ctx.app.pg.query(`INSERT INTO events (event_id, user_id, event_type, occurred_at) VALUES ($1, $2, $3, $4)`, [
      randomUUID(),
      e.user_id,
      e.event_type,
      e.occurred_at,
    ]);
  }
}

describe("GET /v1/metrics/funnel", () => {
  let ctx: TestContext;
  const from = "2026-04-01T00:00:00Z";
  const to = "2026-04-10T00:00:00Z";

  beforeAll(async () => {
    ctx = await startTestApp();
    await ctx.app.pg.query("DELETE FROM events WHERE user_id = ANY($1)", [USERS]);
    await ctx.app.pg.query("DELETE FROM users WHERE user_id = ANY($1)", [USERS]);
    await ctx.app.pg.query(
      `INSERT INTO users (user_id, signup_at, country, plan) SELECT unnest($1::text[]), now(), 'us', 'free'`,
      [USERS]
    );

    await insertEvents(ctx, [
      // U1: completes all three steps in order
      { user_id: "u_test_funnel_1", event_type: "signup", occurred_at: "2026-04-01T00:00:00Z" },
      { user_id: "u_test_funnel_1", event_type: "view_page", occurred_at: "2026-04-01T01:00:00Z" },
      { user_id: "u_test_funnel_1", event_type: "purchase", occurred_at: "2026-04-01T02:00:00Z" },

      // U2: drops after step 2 (no purchase)
      { user_id: "u_test_funnel_2", event_type: "signup", occurred_at: "2026-04-01T00:00:00Z" },
      { user_id: "u_test_funnel_2", event_type: "view_page", occurred_at: "2026-04-01T01:00:00Z" },

      // U3: purchase happens BEFORE the qualifying view_page - must not count as step 3
      { user_id: "u_test_funnel_3", event_type: "signup", occurred_at: "2026-04-01T00:00:00Z" },
      { user_id: "u_test_funnel_3", event_type: "purchase", occurred_at: "2026-04-01T00:30:00Z" },
      { user_id: "u_test_funnel_3", event_type: "view_page", occurred_at: "2026-04-01T01:00:00Z" },

      // U4: view_page happens 8 days after signup - outside the P7D window
      { user_id: "u_test_funnel_4", event_type: "signup", occurred_at: "2026-04-01T00:00:00Z" },
      { user_id: "u_test_funnel_4", event_type: "view_page", occurred_at: "2026-04-09T01:00:00Z" },
    ]);
  });

  afterAll(async () => {
    await ctx.app.pg.query("DELETE FROM events WHERE user_id = ANY($1)", [USERS]);
    await ctx.app.pg.query("DELETE FROM users WHERE user_id = ANY($1)", [USERS]);
    await stopTestApp(ctx);
  });

  it("counts only in-order, in-window transitions", async () => {
    const response = await ctx.app.inject({
      method: "GET",
      url: `/v1/metrics/funnel?from=${from}&to=${to}&steps=signup,view_page,purchase`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.window).toBe("P7D");
    expect(body.steps).toHaveLength(3);
    expect(body.steps[0]).toEqual({ step: "signup", users: 4, conversion_from_prev: 1 });
    expect(body.steps[1]).toEqual({ step: "view_page", users: 3, conversion_from_prev: 0.75 });
    expect(body.steps[2].step).toBe("purchase");
    expect(body.steps[2].users).toBe(1);
    expect(body.steps[2].conversion_from_prev).toBeCloseTo(1 / 3, 10);
  });

  it("respects a custom window", async () => {
    const response = await ctx.app.inject({
      method: "GET",
      url: `/v1/metrics/funnel?from=${from}&to=${to}&steps=signup,view_page&window=P10D`,
    });

    // with a 10-day window U4's step2 now qualifies too
    expect(response.json().steps[1].users).toBe(4);
  });

  it("rejects from > to", async () => {
    const response = await ctx.app.inject({
      method: "GET",
      url: `/v1/metrics/funnel?from=${to}&to=${from}&steps=signup,view_page`,
    });
    expect(response.statusCode).toBe(400);
  });

  it("rejects an unknown query parameter", async () => {
    const response = await ctx.app.inject({
      method: "GET",
      url: `/v1/metrics/funnel?from=${from}&to=${to}&steps=signup&bogus=1`,
    });
    expect(response.statusCode).toBe(400);
  });

  it("serves cached results and invalidates after new ingest", async () => {
    const url = `/v1/metrics/funnel?from=${from}&to=${to}&steps=signup`;

    const first = await ctx.app.inject({ method: "GET", url });
    expect(first.headers["x-cache"]).toBe("MISS");

    const second = await ctx.app.inject({ method: "GET", url });
    expect(second.headers["x-cache"]).toBe("HIT");

    await ctx.app.inject({
      method: "POST",
      url: "/v1/events",
      payload: {
        events: [
          {
            event_id: randomUUID(),
            user_id: "u_test_funnel_1",
            event_type: "signup",
            occurred_at: "2026-04-02T00:00:00Z",
          },
        ],
      },
    });

    const third = await ctx.app.inject({ method: "GET", url });
    expect(third.headers["x-cache"]).toBe("MISS");
  });
});
