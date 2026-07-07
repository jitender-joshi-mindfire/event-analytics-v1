import type { FastifyInstance } from "fastify";
import { assertValidRange } from "../../validation/range.js";
import { decodeCursor, encodeCursor } from "../../pagination/cursor.js";
import { topQuerySchema, topResponseSchema, type TopMetric, type TopQuery } from "../../schemas/top.js";

// All three variants are cast to ::float8 so node-postgres returns a JS
// number directly (bigint/numeric come back as strings by default).
const METRIC_SQL: Record<TopMetric, string> = {
  count: "count(*)::float8",
  sum_amount: "coalesce(sum((payload->>'amount')::numeric), 0)::float8",
  unique_users: "count(distinct user_id)::float8",
};

interface TopRow {
  grp: string | null;
  entity: string;
  rank: number;
  value: number;
  seq: number;
}

function buildQuery(opts: {
  from: string;
  to: string;
  dimension: string;
  groupBy: string | undefined;
  metric: TopMetric;
  n: number;
  cursorSeq: number;
  limit: number;
}): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const bind = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  const fromPh = bind(opts.from);
  const toPh = bind(opts.to);
  const dimensionPh = bind(opts.dimension);
  const groupExpr = opts.groupBy ? `payload ->> ${bind(opts.groupBy)}` : "NULL::text";
  const entityExpr = `payload ->> ${dimensionPh}`;
  const metricExpr = METRIC_SQL[opts.metric];
  const nPh = bind(opts.n);
  const cursorSeqPh = bind(opts.cursorSeq);
  // fetch one extra row to know whether a next page exists
  const limitPh = bind(opts.limit + 1);

  const sql = `
    WITH ranked AS (
      SELECT
        ${groupExpr} AS grp,
        ${entityExpr} AS entity,
        ${metricExpr} AS value,
        (ROW_NUMBER() OVER (
          PARTITION BY ${groupExpr}
          ORDER BY ${metricExpr} DESC, ${entityExpr} ASC
        ))::int AS rank
      FROM events
      WHERE occurred_at >= ${fromPh}::timestamptz
        AND occurred_at < ${toPh}::timestamptz
        AND payload ? ${dimensionPh}
      GROUP BY 1, 2
    ),
    top_n AS (
      SELECT *, (ROW_NUMBER() OVER (ORDER BY grp NULLS FIRST, rank))::int AS seq
      FROM ranked
      WHERE rank <= ${nPh}
    )
    SELECT grp, entity, rank, value, seq
    FROM top_n
    WHERE seq > ${cursorSeqPh}
    ORDER BY seq
    LIMIT ${limitPh}
  `;

  return { sql, params };
}

export function registerTopRoute(app: FastifyInstance): void {
  app.get<{ Querystring: TopQuery }>(
    "/v1/metrics/top",
    { schema: { querystring: topQuerySchema, response: { 200: topResponseSchema } } },
    async (request, reply) => {
      const { from, to, dimension, group_by: groupBy, metric, n, cursor, limit } = request.query;
      assertValidRange(from, to);
      const cursorSeq = decodeCursor(cursor);

      const { sql, params } = buildQuery({ from, to, dimension, groupBy, metric, n, cursorSeq, limit });
      const result = await app.pg.query<TopRow>(sql, params);

      const hasMore = result.rows.length > limit;
      const page = hasMore ? result.rows.slice(0, limit) : result.rows;
      const lastRow = page.at(-1);

      return reply.code(200).send({
        rows: page.map((row) => ({ group: row.grp, entity: row.entity, rank: row.rank, value: row.value })),
        next_cursor: hasMore && lastRow ? encodeCursor(lastRow.seq) : null,
      });
    }
  );
}
