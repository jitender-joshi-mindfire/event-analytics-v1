import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApp, stopTestApp, type TestContext } from "./setup.js";

const USERS = ["u_test_retention_a1", "u_test_retention_a2", "u_test_retention_b1"];

describe("GET /v1/metrics/retention", () => {
  let ctx: TestContext;
  const from = "2026-05-01T00:00:00Z";
  const to = "2026-05-20T00:00:00Z";

  beforeAll(async () => {
    ctx = await startTestApp();
    await ctx.app.pg.query("DELETE FROM events WHERE user_id = ANY($1)", [USERS]);
    await ctx.app.pg.query("DELETE FROM users WHERE user_id = ANY($1)", [USERS]);

    // cohort A: week of 2026-05-04 (Monday), 2 users
    // cohort B: week of 2026-05-11 (Monday), 1 user
    await ctx.app.pg.query(
      `INSERT INTO users (user_id, signup_at, country, plan) VALUES
        ('u_test_retention_a1', '2026-05-04T00:00:00Z', 'us', 'free'),
        ('u_test_retention_a2', '2026-05-04T12:00:00Z', 'us', 'free'),
        ('u_test_retention_b1', '2026-05-11T00:00:00Z', 'us', 'free')`
    );

    const insert = async (userId: string, occurredAt: string): Promise<void> => {
      await ctx.app.pg.query(`INSERT INTO events (event_id, user_id, event_type, occurred_at) VALUES ($1, $2, 'signup', $3)`, [
        randomUUID(),
        userId,
        occurredAt,
      ]);
    };

    // A1: active in week0 (signup), week1, and week2
    await insert("u_test_retention_a1", "2026-05-04T00:00:00Z");
    await insert("u_test_retention_a1", "2026-05-12T00:00:00Z");
    await insert("u_test_retention_a1", "2026-05-19T00:00:00Z");

    // A2: active only in week0 (signup)
    await insert("u_test_retention_a2", "2026-05-04T12:00:00Z");

    // B1: active only in week0 (signup)
    await insert("u_test_retention_b1", "2026-05-11T00:00:00Z");
  });

  afterAll(async () => {
    await ctx.app.pg.query("DELETE FROM events WHERE user_id = ANY($1)", [USERS]);
    await ctx.app.pg.query("DELETE FROM users WHERE user_id = ANY($1)", [USERS]);
    await stopTestApp(ctx);
  });

  it("builds a cohort grid with week 0 at 1.0 and a correct diagonal", async () => {
    const response = await ctx.app.inject({
      method: "GET",
      url: `/v1/metrics/retention?from=${from}&to=${to}&max_weeks=3`,
    });

    expect(response.statusCode).toBe(200);
    const cohorts = response.json().cohorts as { cohort_week: string; size: number; retention: number[] }[];
    expect(cohorts).toHaveLength(2);

    const cohortA = cohorts.find((c) => c.cohort_week === "2026-05-04");
    expect(cohortA).toBeDefined();
    expect(cohortA?.size).toBe(2);
    expect(cohortA?.retention).toHaveLength(4);
    expect(cohortA?.retention[0]).toBe(1); // both users active in signup week
    expect(cohortA?.retention[1]).toBeCloseTo(0.5, 10); // only A1
    expect(cohortA?.retention[2]).toBeCloseTo(0.5, 10); // only A1
    expect(cohortA?.retention[3]).toBe(0);

    const cohortB = cohorts.find((c) => c.cohort_week === "2026-05-11");
    expect(cohortB).toBeDefined();
    expect(cohortB?.size).toBe(1);
    expect(cohortB?.retention[0]).toBe(1);
    expect(cohortB?.retention[1]).toBe(0);
  });

  it("row totals sanity-check against cohort size", async () => {
    const response = await ctx.app.inject({
      method: "GET",
      url: `/v1/metrics/retention?from=${from}&to=${to}&max_weeks=3`,
    });

    const cohorts = response.json().cohorts as { size: number; retention: number[] }[];
    for (const cohort of cohorts) {
      for (const fraction of cohort.retention) {
        expect(fraction).toBeGreaterThanOrEqual(0);
        expect(fraction).toBeLessThanOrEqual(1);
      }
    }
  });

  it("rejects from > to", async () => {
    const response = await ctx.app.inject({ method: "GET", url: `/v1/metrics/retention?from=${to}&to=${from}` });
    expect(response.statusCode).toBe(400);
  });
});
