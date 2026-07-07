import type { FastifyInstance } from "fastify";
import { assertValidRange } from "../validation/range.js";
import { decodeCursor, encodeCursor } from "../pagination/cursor.js";
import { sessionsQuerySchema, sessionsResponseSchema, type SessionsQuery } from "../schemas/sessions.js";

// Classic gap-and-island: LAG per user to find the gap since the previous
// event, flag a new session whenever that gap exceeds gap_minutes (or there
// is no previous event), then a running SUM of that flag per user gives each
// event a stable session number to aggregate on. Cursor-paginated over a
// synthetic seq column ordered by (user_id, started_at), never OFFSET.
const SQL = `
  WITH ordered AS (
    SELECT user_id, occurred_at,
      LAG(occurred_at) OVER (PARTITION BY user_id ORDER BY occurred_at) AS prev_ts
    FROM events
    WHERE occurred_at >= $1::timestamptz AND occurred_at < $2::timestamptz
      AND ($3::text IS NULL OR user_id = $3::text)
  ),
  flagged AS (
    SELECT user_id, occurred_at,
      CASE WHEN prev_ts IS NULL OR occurred_at - prev_ts > $4::interval THEN 1 ELSE 0 END AS is_new_session
    FROM ordered
  ),
  grouped AS (
    SELECT user_id, occurred_at,
      SUM(is_new_session) OVER (PARTITION BY user_id ORDER BY occurred_at) AS session_num
    FROM flagged
  ),
  sessions AS (
    SELECT
      user_id,
      session_num,
      min(occurred_at) AS started_at,
      max(occurred_at) AS ended_at,
      count(*)::int AS events
    FROM grouped
    GROUP BY user_id, session_num
  ),
  numbered AS (
    SELECT *, (ROW_NUMBER() OVER (ORDER BY user_id, started_at))::int AS seq
    FROM sessions
  )
  SELECT user_id, started_at, ended_at, events, seq
  FROM numbered
  WHERE seq > $5
  ORDER BY seq
  LIMIT $6
`;

interface SessionRow {
  user_id: string;
  started_at: Date;
  ended_at: Date;
  events: number;
  seq: number;
}

export function registerSessionsRoute(app: FastifyInstance): void {
  app.get<{ Querystring: SessionsQuery }>(
    "/v1/sessions/active",
    { schema: { querystring: sessionsQuerySchema, response: { 200: sessionsResponseSchema } } },
    async (request, reply) => {
      const { from, to, gap_minutes: gapMinutes, user_id: userId, cursor, limit } = request.query;
      assertValidRange(from, to);
      const cursorSeq = decodeCursor(cursor);

      const result = await app.pg.query<SessionRow>(SQL, [
        from,
        to,
        userId ?? null,
        `${gapMinutes} minutes`,
        cursorSeq,
        limit + 1,
      ]);

      const hasMore = result.rows.length > limit;
      const page = hasMore ? result.rows.slice(0, limit) : result.rows;
      const lastRow = page.at(-1);

      return reply.code(200).send({
        sessions: page.map((row) => ({
          user_id: row.user_id,
          started_at: row.started_at.toISOString(),
          ended_at: row.ended_at.toISOString(),
          events: row.events,
          duration_seconds: Math.round((row.ended_at.getTime() - row.started_at.getTime()) / 1000),
        })),
        next_cursor: hasMore && lastRow ? encodeCursor(lastRow.seq) : null,
      });
    }
  );
}
