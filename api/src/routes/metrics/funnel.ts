import type { FastifyInstance } from "fastify";
import { assertValidRange } from "../../validation/range.js";
import { badRequest } from "../../errors/problem.js";
import { getCachedJson, setCachedJson } from "../../cache/cachedJson.js";
import { getEventsVersion } from "../../cache/eventsVersion.js";
import { funnelQuerySchema, funnelResponseSchema, type FunnelQuery } from "../../schemas/funnel.js";

const MAX_STEPS = 10;
const CACHE_TTL_SECONDS = 120;

function parseSteps(raw: string): string[] {
  const steps = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (steps.length < 1 || steps.length > MAX_STEPS) {
    throw badRequest(`'steps' must list between 1 and ${MAX_STEPS} event types.`, [
      { field: "steps", message: `must have between 1 and ${MAX_STEPS} comma-separated values` },
    ]);
  }
  return steps;
}

// Chains one CTE per step: step_1 anchors on [from, to), each step_N joins
// events of that type strictly after (>, not >=) the previous step's
// timestamp and within `window` of it — never cumulative from step_1, so a
// user who lags on one transition isn't retroactively disqualified from an
// earlier one. A final UNION ALL with an explicit index avoids relying on
// branch-order being preserved by the planner.
function buildFunnelQuery(steps: string[], from: string, to: string, window: string): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const bind = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  const fromPh = bind(from);
  const toPh = bind(to);
  // Bound lazily: a single-step funnel never joins on `window`, and a bound
  // parameter that never appears in the query text leaves Postgres unable to
  // infer its type ("could not determine data type of parameter $n").
  let windowPh: string | null = null;
  const getWindowPh = (): string => {
    windowPh ??= bind(window);
    return windowPh;
  };

  const ctes = steps.map((step, i) => {
    const stepPh = bind(step);
    if (i === 0) {
      return `step_1 AS (
        SELECT user_id, min(occurred_at) AS ts
        FROM events
        WHERE event_type = ${stepPh} AND occurred_at >= ${fromPh}::timestamptz AND occurred_at < ${toPh}::timestamptz
        GROUP BY user_id
      )`;
    }
    return `step_${i + 1} AS (
      SELECT s.user_id, min(e.occurred_at) AS ts
      FROM step_${i} s
      JOIN events e ON e.user_id = s.user_id
        AND e.event_type = ${stepPh}
        AND e.occurred_at > s.ts
        AND e.occurred_at <= s.ts + ${getWindowPh()}::interval
      GROUP BY s.user_id
    )`;
  });

  const selects = steps.map((_, i) => `SELECT ${i + 1} AS idx, count(*)::int AS users FROM step_${i + 1}`);

  const sql = `WITH ${ctes.join(",\n")}\n${selects.join("\nUNION ALL\n")}\nORDER BY idx`;
  return { sql, params };
}

interface FunnelRow {
  idx: number;
  users: number;
}

export function registerFunnelRoute(app: FastifyInstance): void {
  app.get<{ Querystring: FunnelQuery }>(
    "/v1/metrics/funnel",
    { schema: { querystring: funnelQuerySchema, response: { 200: funnelResponseSchema } } },
    async (request, reply) => {
      const { from, to, steps: rawSteps, window } = request.query;
      assertValidRange(from, to);
      const steps = parseSteps(rawSteps);

      const version = await getEventsVersion(app.redis);
      const cacheKey = `funnel:v${version}:${from}:${to}:${window}:${steps.join("|")}`;
      const cached = await getCachedJson<{ window: string; steps: unknown[] }>(app.redis, cacheKey);
      if (cached) {
        reply.header("x-cache", "HIT");
        return reply.code(200).send(cached);
      }

      const { sql, params } = buildFunnelQuery(steps, from, to, window);

      let result;
      try {
        result = await app.pg.query<FunnelRow>(sql, params);
      } catch (err) {
        const pgError = err as { code?: string };
        if (pgError.code === "22007" || pgError.code === "22P02") {
          throw badRequest("'window' is not a valid ISO-8601 duration.", [
            { field: "window", message: "is not a valid duration" },
          ]);
        }
        throw err;
      }

      const counts = result.rows.map((row) => row.users);
      const body = {
        window,
        steps: steps.map((step, i) => {
          const users = counts[i] ?? 0;
          const prev = i === 0 ? users : (counts[i - 1] ?? 0);
          const conversion = prev === 0 ? 0 : users / prev;
          return { step, users, conversion_from_prev: i === 0 ? 1 : conversion };
        }),
      };

      await setCachedJson(app.redis, cacheKey, body, CACHE_TTL_SECONDS);
      reply.header("x-cache", "MISS");
      return reply.code(200).send(body);
    }
  );
}
