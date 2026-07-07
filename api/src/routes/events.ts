import type { FastifyInstance } from "fastify";
import { badRequest, tooManyRequests } from "../errors/problem.js";
import { eventBatchBodySchema, type EventBatchInput } from "../schemas/event.js";
import { bumpEventsVersion } from "../cache/eventsVersion.js";
import { isIngestRateLimited } from "../rateLimit/ingestRateLimiter.js";

const ingestResultSchema = {
  type: "object",
  required: ["received", "accepted", "duplicates"],
  additionalProperties: false,
  properties: {
    received: { type: "integer", minimum: 0 },
    accepted: { type: "integer", minimum: 0 },
    duplicates: { type: "integer", minimum: 0 },
  },
} as const;

// Single unnest-based bulk INSERT: one round-trip, no per-row awaits, so a
// 5000-row batch cannot monopolize the event loop the way a JS-side loop would.
const INSERT_SQL = `
  INSERT INTO events (event_id, user_id, session_id, event_type, occurred_at, payload)
  SELECT * FROM unnest(
    $1::uuid[], $2::text[], $3::text[], $4::text[], $5::timestamptz[], $6::jsonb[]
  ) AS t(event_id, user_id, session_id, event_type, occurred_at, payload)
  ON CONFLICT (event_id) DO NOTHING
  RETURNING event_id
`;

function foreignKeyDetailToMessage(detail: string | undefined): string {
  const match = detail?.match(/\(user_id\)=\(([^)]+)\)/);
  return match ? `Unknown user_id: ${match[1]}` : "One or more events reference an unknown user_id.";
}

export function registerEventsRoute(app: FastifyInstance): void {
  app.post<{ Body: EventBatchInput }>(
    "/v1/events",
    {
      schema: {
        body: eventBatchBodySchema,
        response: { 202: ingestResultSchema },
      },
    },
    async (request, reply) => {
      const { events } = request.body;

      if (await isIngestRateLimited(app.redis)) {
        throw tooManyRequests("Ingest rate limit exceeded. Slow down and retry shortly.");
      }

      const eventIds = events.map((e) => e.event_id);
      const userIds = events.map((e) => e.user_id);
      const sessionIds = events.map((e) => e.session_id ?? null);
      const eventTypes = events.map((e) => e.event_type);
      const occurredAts = events.map((e) => e.occurred_at);
      const payloads = events.map((e) => JSON.stringify(e.payload ?? {}));

      try {
        const result = await app.pg.query(INSERT_SQL, [
          eventIds,
          userIds,
          sessionIds,
          eventTypes,
          occurredAts,
          payloads,
        ]);

        const accepted = result.rowCount ?? 0;
        if (accepted > 0) {
          // Only bump on genuinely new rows; a pure duplicate resend shouldn't
          // invalidate the timeseries cache.
          await bumpEventsVersion(app.redis);
        }
        return reply.code(202).send({
          received: events.length,
          accepted,
          duplicates: events.length - accepted,
        });
      } catch (err) {
        const pgError = err as { code?: string; detail?: string };
        if (pgError.code === "23503") {
          throw badRequest(foreignKeyDetailToMessage(pgError.detail), [
            { field: "events[].user_id", message: foreignKeyDetailToMessage(pgError.detail) },
          ]);
        }
        throw err;
      }
    }
  );
}
