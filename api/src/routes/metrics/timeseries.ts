import type { FastifyInstance } from "fastify";
import { assertValidRange } from "../../validation/range.js";
import { getCachedJson, setCachedJson } from "../../cache/cachedJson.js";
import { getEventsVersion } from "../../cache/eventsVersion.js";
import { timeseriesQuerySchema, timeseriesResponseSchema, type TimeseriesQuery } from "../../schemas/timeseries.js";

const BUCKET_INTERVAL: Record<TimeseriesQuery["bucket"], string> = {
  hour: "1 hour",
  day: "1 day",
  week: "1 week",
};

// Cache aggregates for 60s: short enough that a dashboard refresh sees new
// ingest within a minute, long enough to absorb repeated widget polling
// without re-scanning the events table on every request.
const CACHE_TTL_SECONDS = 60;

const SQL = `
  WITH buckets AS (
    SELECT generate_series(
      date_trunc($1, $2::timestamptz),
      date_trunc($1, $3::timestamptz - interval '1 microsecond'),
      $4::interval
    ) AS ts
  ),
  counts AS (
    SELECT date_trunc($1, occurred_at) AS ts, count(*) AS count
    FROM events
    WHERE occurred_at >= $2::timestamptz
      AND occurred_at < $3::timestamptz
      AND ($5::text IS NULL OR event_type = $5::text)
    GROUP BY 1
  )
  SELECT b.ts, COALESCE(c.count, 0)::int AS count
  FROM buckets b
  LEFT JOIN counts c ON c.ts = b.ts
  ORDER BY b.ts
`;

interface TimeseriesRow {
  bucket: TimeseriesQuery["bucket"];
  series: { ts: string; count: number }[];
}

export function registerTimeseriesRoute(app: FastifyInstance): void {
  app.get<{ Querystring: TimeseriesQuery }>(
    "/v1/metrics/timeseries",
    { schema: { querystring: timeseriesQuerySchema, response: { 200: timeseriesResponseSchema } } },
    async (request, reply) => {
      const { from, to, bucket, event_type: eventType } = request.query;
      assertValidRange(from, to);

      const version = await getEventsVersion(app.redis);
      const cacheKey = `timeseries:v${version}:${from}:${to}:${bucket}:${eventType ?? ""}`;

      const cached = await getCachedJson<TimeseriesRow>(app.redis, cacheKey);
      if (cached) {
        reply.header("x-cache", "HIT");
        return reply.code(200).send(cached);
      }

      const result = await app.pg.query<{ ts: Date; count: number }>(SQL, [
        bucket,
        from,
        to,
        BUCKET_INTERVAL[bucket],
        eventType ?? null,
      ]);
      const body: TimeseriesRow = {
        bucket,
        series: result.rows.map((row) => ({
          ts: row.ts.toISOString(),
          count: row.count,
        })),
      };

      await setCachedJson(app.redis, cacheKey, body, CACHE_TTL_SECONDS);
      reply.header("x-cache", "MISS");
      return reply.code(200).send(body);
    }
  );
}
