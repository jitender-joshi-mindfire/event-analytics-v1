import type { FastifyInstance } from "fastify";
import { assertValidRange } from "../../validation/range.js";
import { latencyQuerySchema, latencyResponseSchema, type LatencyQuery } from "../../schemas/latency.js";

// percentile_cont interpolates between adjacent values; percentile_disc would
// return an actual observed value. We use _cont consistently across all four
// percentiles per the QUERIES.md guidance to "pick one and be consistent".
// The numeric-looking regex guard avoids a cast error when `field` holds
// non-numeric payload values (e.g. running latency on a text field by mistake).
const SQL = `
  SELECT
    count(*)::int AS count,
    coalesce(percentile_cont(0.5)  WITHIN GROUP (ORDER BY (payload->>$3)::numeric), 0)::float8 AS p50,
    coalesce(percentile_cont(0.9)  WITHIN GROUP (ORDER BY (payload->>$3)::numeric), 0)::float8 AS p90,
    coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY (payload->>$3)::numeric), 0)::float8 AS p95,
    coalesce(percentile_cont(0.99) WITHIN GROUP (ORDER BY (payload->>$3)::numeric), 0)::float8 AS p99
  FROM events
  WHERE occurred_at >= $1::timestamptz
    AND occurred_at < $2::timestamptz
    AND ($4::text IS NULL OR event_type = $4::text)
    AND payload->>$3 ~ '^-?\\d+(\\.\\d+)?$'
`;

interface LatencyRow {
  count: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}

export function registerLatencyRoute(app: FastifyInstance): void {
  app.get<{ Querystring: LatencyQuery }>(
    "/v1/metrics/latency",
    { schema: { querystring: latencyQuerySchema, response: { 200: latencyResponseSchema } } },
    async (request, reply) => {
      const { from, to, field, event_type: eventType } = request.query;
      assertValidRange(from, to);

      const result = await app.pg.query<LatencyRow>(SQL, [from, to, field, eventType ?? null]);
      const row = result.rows[0];
      if (!row) {
        throw new Error("percentile aggregate query returned no rows");
      }

      return reply.code(200).send({
        field,
        count: row.count,
        p50: row.p50,
        p90: row.p90,
        p95: row.p95,
        p99: row.p99,
      });
    }
  );
}
