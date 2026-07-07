import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApp, stopTestApp, type TestContext } from "./setup.js";

const USERS = ["u_test_sessions_1", "u_test_sessions_2"];

describe("GET /v1/sessions/active", () => {
  let ctx: TestContext;
  const from = "2026-06-01T00:00:00Z";
  const to = "2026-06-01T02:00:00Z";

  beforeAll(async () => {
    ctx = await startTestApp();
    await ctx.app.pg.query("DELETE FROM events WHERE user_id = ANY($1)", [USERS]);
    await ctx.app.pg.query("DELETE FROM users WHERE user_id = ANY($1)", [USERS]);
    await ctx.app.pg.query(
      `INSERT INTO users (user_id, signup_at, country, plan) SELECT unnest($1::text[]), now(), 'us', 'free'`,
      [USERS]
    );

    const insert = async (userId: string, occurredAt: string): Promise<void> => {
      await ctx.app.pg.query(`INSERT INTO events (event_id, user_id, event_type, occurred_at) VALUES ($1, $2, 'view_page', $3)`, [
        randomUUID(),
        userId,
        occurredAt,
      ]);
    };

    // U1: three events within a 30-min gap (one session), then a 45-min gap (new session)
    await insert("u_test_sessions_1", "2026-06-01T00:00:00Z");
    await insert("u_test_sessions_1", "2026-06-01T00:10:00Z");
    await insert("u_test_sessions_1", "2026-06-01T00:15:00Z");
    await insert("u_test_sessions_1", "2026-06-01T01:00:00Z");

    // U2: single event, single session
    await insert("u_test_sessions_2", "2026-06-01T00:05:00Z");
  });

  afterAll(async () => {
    await ctx.app.pg.query("DELETE FROM events WHERE user_id = ANY($1)", [USERS]);
    await ctx.app.pg.query("DELETE FROM users WHERE user_id = ANY($1)", [USERS]);
    await stopTestApp(ctx);
  });

  it("splits sessions at the inactivity gap boundary", async () => {
    const response = await ctx.app.inject({
      method: "GET",
      url: `/v1/sessions/active?from=${from}&to=${to}&user_id=u_test_sessions_1`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().sessions).toEqual([
      {
        user_id: "u_test_sessions_1",
        started_at: "2026-06-01T00:00:00.000Z",
        ended_at: "2026-06-01T00:15:00.000Z",
        events: 3,
        duration_seconds: 900,
      },
      {
        user_id: "u_test_sessions_1",
        started_at: "2026-06-01T01:00:00.000Z",
        ended_at: "2026-06-01T01:00:00.000Z",
        events: 1,
        duration_seconds: 0,
      },
    ]);
  });

  it("uses a smaller gap_minutes to split more aggressively", async () => {
    const response = await ctx.app.inject({
      method: "GET",
      url: `/v1/sessions/active?from=${from}&to=${to}&user_id=u_test_sessions_1&gap_minutes=5`,
    });

    // the 10-min gap between the first two events now also splits
    expect(response.json().sessions).toHaveLength(3);
  });

  it("paginates via cursor across users without duplicates or gaps", async () => {
    const url = `/v1/sessions/active?from=${from}&to=${to}&limit=1`;

    const page1 = await ctx.app.inject({ method: "GET", url });
    const body1 = page1.json();
    expect(body1.sessions).toHaveLength(1);
    expect(body1.next_cursor).not.toBeNull();

    const page2 = await ctx.app.inject({ method: "GET", url: `${url}&cursor=${body1.next_cursor}` });
    const body2 = page2.json();
    expect(body2.sessions).toHaveLength(1);
    expect(body2.next_cursor).not.toBeNull();

    const page3 = await ctx.app.inject({ method: "GET", url: `${url}&cursor=${body2.next_cursor}` });
    const body3 = page3.json();
    expect(body3.sessions).toHaveLength(1);
    expect(body3.next_cursor).toBeNull();

    const allUserIds = [body1, body2, body3].map((b) => `${b.sessions[0].user_id}:${b.sessions[0].started_at}`);
    expect(new Set(allUserIds).size).toBe(3);
  });

  it("rejects from > to", async () => {
    const response = await ctx.app.inject({ method: "GET", url: `/v1/sessions/active?from=${to}&to=${from}` });
    expect(response.statusCode).toBe(400);
  });

  it("rejects an unknown query parameter", async () => {
    const response = await ctx.app.inject({ method: "GET", url: `/v1/sessions/active?from=${from}&to=${to}&bogus=1` });
    expect(response.statusCode).toBe(400);
  });
});
