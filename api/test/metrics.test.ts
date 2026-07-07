import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestApp, stopTestApp, type TestContext } from "./setup.js";

const USER_1 = "u_test_metrics_1";
const USER_2 = "u_test_metrics_2";

interface EventFixture {
  user_id: string;
  event_type: string;
  occurred_at: string;
  payload: Record<string, unknown>;
}

async function insertEvents(ctx: TestContext, events: EventFixture[]): Promise<void> {
  for (const e of events) {
    await ctx.app.pg.query(
      `INSERT INTO events (event_id, user_id, event_type, occurred_at, payload) VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), e.user_id, e.event_type, e.occurred_at, JSON.stringify(e.payload)]
    );
  }
}

describe("metrics endpoints", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await startTestApp();
    await ctx.app.pg.query("DELETE FROM events WHERE user_id = ANY($1)", [[USER_1, USER_2]]);
    await ctx.app.pg.query("DELETE FROM users WHERE user_id = ANY($1)", [[USER_1, USER_2]]);
    await ctx.app.pg.query(
      `INSERT INTO users (user_id, signup_at, country, plan) VALUES ($1, now(), 'us', 'free'), ($2, now(), 'us', 'free')`,
      [USER_1, USER_2]
    );
  });

  afterAll(async () => {
    await ctx.app.pg.query("DELETE FROM events WHERE user_id = ANY($1)", [[USER_1, USER_2]]);
    await ctx.app.pg.query("DELETE FROM users WHERE user_id = ANY($1)", [[USER_1, USER_2]]);
    await stopTestApp(ctx);
  });

  describe("GET /v1/metrics/timeseries", () => {
    const from = "2026-03-01T00:00:00Z";
    const to = "2026-03-01T04:00:00Z";

    beforeAll(async () => {
      await insertEvents(ctx, [
        { user_id: USER_1, event_type: "view_page", occurred_at: "2026-03-01T00:15:00Z", payload: {} },
        { user_id: USER_1, event_type: "view_page", occurred_at: "2026-03-01T00:45:00Z", payload: {} },
        { user_id: USER_1, event_type: "login", occurred_at: "2026-03-01T00:20:00Z", payload: {} },
        { user_id: USER_1, event_type: "view_page", occurred_at: "2026-03-01T02:10:00Z", payload: {} },
        { user_id: USER_1, event_type: "view_page", occurred_at: "2026-03-01T02:20:00Z", payload: {} },
        { user_id: USER_1, event_type: "view_page", occurred_at: "2026-03-01T02:30:00Z", payload: {} },
      ]);
    });

    it("gap-fills zero buckets and aligns to UTC hour boundaries", async () => {
      const response = await ctx.app.inject({
        method: "GET",
        url: `/v1/metrics/timeseries?from=${from}&to=${to}&bucket=hour`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        bucket: "hour",
        series: [
          { ts: "2026-03-01T00:00:00.000Z", count: 3 },
          { ts: "2026-03-01T01:00:00.000Z", count: 0 },
          { ts: "2026-03-01T02:00:00.000Z", count: 3 },
          { ts: "2026-03-01T03:00:00.000Z", count: 0 },
        ],
      });
    });

    it("filters by event_type", async () => {
      const response = await ctx.app.inject({
        method: "GET",
        url: `/v1/metrics/timeseries?from=${from}&to=${to}&bucket=hour&event_type=view_page`,
      });

      const body = response.json();
      expect(body.series[0]).toEqual({ ts: "2026-03-01T00:00:00.000Z", count: 2 });
    });

    it("rejects from > to", async () => {
      const response = await ctx.app.inject({
        method: "GET",
        url: `/v1/metrics/timeseries?from=${to}&to=${from}&bucket=hour`,
      });
      expect(response.statusCode).toBe(400);
    });

    it("rejects an unknown query parameter", async () => {
      const response = await ctx.app.inject({
        method: "GET",
        url: `/v1/metrics/timeseries?from=${from}&to=${to}&bucket=hour&bogus=1`,
      });
      expect(response.statusCode).toBe(400);
    });

    it("serves cached results on repeat requests and invalidates after new ingest", async () => {
      const url = `/v1/metrics/timeseries?from=${from}&to=${to}&bucket=hour&event_type=login`;

      const first = await ctx.app.inject({ method: "GET", url });
      expect(first.headers["x-cache"]).toBe("MISS");

      const second = await ctx.app.inject({ method: "GET", url });
      expect(second.headers["x-cache"]).toBe("HIT");
      expect(second.json()).toEqual(first.json());

      await ctx.app.inject({
        method: "POST",
        url: "/v1/events",
        payload: {
          events: [
            {
              event_id: randomUUID(),
              user_id: USER_1,
              event_type: "login",
              occurred_at: "2026-03-01T00:50:00Z",
              payload: {},
            },
          ],
        },
      });

      const third = await ctx.app.inject({ method: "GET", url });
      expect(third.headers["x-cache"]).toBe("MISS");
      expect(third.json().series[0].count).toBe(2);
    });
  });

  describe("GET /v1/metrics/top", () => {
    const from = "2026-03-02T00:00:00Z";
    const to = "2026-03-02T01:00:00Z";

    beforeAll(async () => {
      const pages = [
        ...Array(3).fill("A"),
        ...Array(3).fill("B"),
        ...Array(1).fill("C"),
      ];
      await insertEvents(
        ctx,
        pages.map((page, i) => ({
          user_id: USER_1,
          event_type: "top_test",
          occurred_at: `2026-03-02T00:${String(i).padStart(2, "0")}:00Z`,
          payload: { page, amount: 10, country: page === "C" ? "uk" : "us" },
        }))
      );
    });

    it("ranks by count with a deterministic alphabetical tie-break", async () => {
      const response = await ctx.app.inject({
        method: "GET",
        url: `/v1/metrics/top?from=${from}&to=${to}&dimension=page`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().rows).toEqual([
        { group: null, entity: "A", rank: 1, value: 3 },
        { group: null, entity: "B", rank: 2, value: 3 },
        { group: null, entity: "C", rank: 3, value: 1 },
      ]);
    });

    it("paginates via cursor without duplicates or gaps", async () => {
      const url = `/v1/metrics/top?from=${from}&to=${to}&dimension=page&n=3&limit=1`;

      const page1 = await ctx.app.inject({ method: "GET", url });
      const body1 = page1.json();
      expect(body1.rows).toEqual([{ group: null, entity: "A", rank: 1, value: 3 }]);
      expect(body1.next_cursor).not.toBeNull();

      const page2 = await ctx.app.inject({ method: "GET", url: `${url}&cursor=${body1.next_cursor}` });
      const body2 = page2.json();
      expect(body2.rows).toEqual([{ group: null, entity: "B", rank: 2, value: 3 }]);
      expect(body2.next_cursor).not.toBeNull();

      const page3 = await ctx.app.inject({ method: "GET", url: `${url}&cursor=${body2.next_cursor}` });
      const body3 = page3.json();
      expect(body3.rows).toEqual([{ group: null, entity: "C", rank: 3, value: 1 }]);
      expect(body3.next_cursor).toBeNull();
    });

    it("ranks within each group when group_by is provided", async () => {
      const response = await ctx.app.inject({
        method: "GET",
        url: `/v1/metrics/top?from=${from}&to=${to}&dimension=page&group_by=country`,
      });

      const rows = response.json().rows as { group: string; entity: string; rank: number }[];
      const uk = rows.filter((r) => r.group === "uk");
      const us = rows.filter((r) => r.group === "us");
      expect(uk).toEqual([{ group: "uk", entity: "C", rank: 1, value: 1 }]);
      expect(us.map((r) => r.entity)).toEqual(["A", "B"]);
    });

    it("supports the sum_amount metric", async () => {
      const response = await ctx.app.inject({
        method: "GET",
        url: `/v1/metrics/top?from=${from}&to=${to}&dimension=page&metric=sum_amount`,
      });
      expect(response.json().rows[0]).toEqual({ group: null, entity: "A", rank: 1, value: 30 });
    });

    it("supports the unique_users metric", async () => {
      await insertEvents(ctx, [
        { user_id: USER_2, event_type: "top_test", occurred_at: "2026-03-02T00:30:00Z", payload: { page: "C" } },
      ]);

      const response = await ctx.app.inject({
        method: "GET",
        url: `/v1/metrics/top?from=${from}&to=${to}&dimension=page&metric=unique_users`,
      });
      const rows = response.json().rows as { entity: string; value: number }[];
      const c = rows.find((r) => r.entity === "C");
      expect(c?.value).toBe(2);
    });
  });

  describe("GET /v1/metrics/latency", () => {
    const from = "2026-03-03T00:00:00Z";
    const to = "2026-03-03T01:00:00Z";

    beforeAll(async () => {
      const values = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
      await insertEvents(ctx, [
        ...values.map((v, i) => ({
          user_id: USER_1,
          event_type: "latency_test",
          occurred_at: `2026-03-03T00:${String(i).padStart(2, "0")}:00Z`,
          payload: { latency_ms: v },
        })),
        {
          user_id: USER_1,
          event_type: "latency_test",
          occurred_at: "2026-03-03T00:20:00Z",
          payload: { latency_ms: "not-a-number" },
        },
      ]);
    });

    it("computes interpolated percentiles and ignores non-numeric values", async () => {
      const response = await ctx.app.inject({
        method: "GET",
        url: `/v1/metrics/latency?from=${from}&to=${to}&event_type=latency_test`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        field: "latency_ms",
        count: 10,
        p50: 550,
        p90: 910,
        p95: 955,
        p99: 991,
      });
    });

    it("returns zeroed percentiles for an empty range", async () => {
      const response = await ctx.app.inject({
        method: "GET",
        url: `/v1/metrics/latency?from=2026-03-03T02:00:00Z&to=2026-03-03T03:00:00Z&event_type=latency_test`,
      });

      expect(response.json()).toEqual({ field: "latency_ms", count: 0, p50: 0, p90: 0, p95: 0, p99: 0 });
    });
  });
});
