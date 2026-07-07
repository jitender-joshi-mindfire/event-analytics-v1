import type { FastifyInstance } from "fastify";
import { assertValidRange } from "../../validation/range.js";
import { getCachedJson, setCachedJson } from "../../cache/cachedJson.js";
import { getEventsVersion } from "../../cache/eventsVersion.js";
import { retentionQuerySchema, retentionResponseSchema, type RetentionQuery } from "../../schemas/retention.js";

const CACHE_TTL_SECONDS = 120;

// Week 0 is the signup week itself, and every user has exactly one signup
// event at signup_at (see data/seed/generate_seed.sql), so counting that
// event as activity makes week 0 exactly 1.0 for every cohort — the
// convention documented in QUERIES.md's correctness notes.
const SQL = `
  WITH cohort_users AS (
    SELECT user_id, date_trunc('week', signup_at) AS cohort_week
    FROM users
    WHERE signup_at >= $1::timestamptz AND signup_at < $2::timestamptz
  ),
  cohort_sizes AS (
    SELECT cohort_week, count(*)::int AS size
    FROM cohort_users
    GROUP BY cohort_week
  ),
  activity AS (
    SELECT
      cu.cohort_week,
      cu.user_id,
      (floor(extract(epoch FROM date_trunc('week', e.occurred_at) - cu.cohort_week) / 604800))::int AS week_offset
    FROM cohort_users cu
    JOIN events e ON e.user_id = cu.user_id
    WHERE date_trunc('week', e.occurred_at) >= cu.cohort_week
      AND (floor(extract(epoch FROM date_trunc('week', e.occurred_at) - cu.cohort_week) / 604800))::int <= $3
  ),
  retention_counts AS (
    SELECT cohort_week, week_offset, count(DISTINCT user_id)::int AS active_users
    FROM activity
    GROUP BY cohort_week, week_offset
  )
  SELECT cs.cohort_week, cs.size, rc.week_offset, rc.active_users
  FROM cohort_sizes cs
  LEFT JOIN retention_counts rc ON rc.cohort_week = cs.cohort_week
  ORDER BY cs.cohort_week, rc.week_offset
`;

interface RetentionRow {
  cohort_week: Date;
  size: number;
  week_offset: number | null;
  active_users: number | null;
}

export function registerRetentionRoute(app: FastifyInstance): void {
  app.get<{ Querystring: RetentionQuery }>(
    "/v1/metrics/retention",
    { schema: { querystring: retentionQuerySchema, response: { 200: retentionResponseSchema } } },
    async (request, reply) => {
      const { from, to, max_weeks: maxWeeks } = request.query;
      assertValidRange(from, to);

      const version = await getEventsVersion(app.redis);
      const cacheKey = `retention:v${version}:${from}:${to}:${maxWeeks}`;
      const cached = await getCachedJson<{ cohorts: unknown[] }>(app.redis, cacheKey);
      if (cached) {
        reply.header("x-cache", "HIT");
        return reply.code(200).send(cached);
      }

      const result = await app.pg.query<RetentionRow>(SQL, [from, to, maxWeeks]);

      const cohorts = new Map<string, { cohortWeek: string; size: number; retention: number[] }>();
      for (const row of result.rows) {
        const key = row.cohort_week.toISOString();
        let cohort = cohorts.get(key);
        if (!cohort) {
          cohort = {
            cohortWeek: row.cohort_week.toISOString().slice(0, 10),
            size: row.size,
            retention: new Array<number>(maxWeeks + 1).fill(0),
          };
          cohorts.set(key, cohort);
        }
        if (row.week_offset !== null && row.active_users !== null && row.week_offset <= maxWeeks) {
          cohort.retention[row.week_offset] = row.size === 0 ? 0 : row.active_users / row.size;
        }
      }

      const body = {
        cohorts: Array.from(cohorts.values())
          .sort((a, b) => a.cohortWeek.localeCompare(b.cohortWeek))
          .map((c) => ({ cohort_week: c.cohortWeek, size: c.size, retention: c.retention })),
      };

      await setCachedJson(app.redis, cacheKey, body, CACHE_TTL_SECONDS);
      reply.header("x-cache", "MISS");
      return reply.code(200).send(body);
    }
  );
}
