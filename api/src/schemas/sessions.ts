import { cursorParamSchema, fromParamSchema, limitParamSchema, toParamSchema } from "./common.js";

export const sessionsQuerySchema = {
  type: "object",
  required: ["from", "to"],
  additionalProperties: false,
  properties: {
    from: fromParamSchema,
    to: toParamSchema,
    gap_minutes: { type: "integer", minimum: 1, maximum: 240, default: 30 },
    user_id: { type: "string" },
    cursor: cursorParamSchema,
    limit: limitParamSchema,
  },
} as const;

export const sessionsResponseSchema = {
  type: "object",
  required: ["sessions"],
  additionalProperties: false,
  properties: {
    sessions: {
      type: "array",
      items: {
        type: "object",
        required: ["user_id", "started_at", "ended_at", "events", "duration_seconds"],
        additionalProperties: false,
        properties: {
          user_id: { type: "string" },
          started_at: { type: "string", format: "date-time" },
          ended_at: { type: "string", format: "date-time" },
          events: { type: "integer", minimum: 1 },
          duration_seconds: { type: "integer", minimum: 0 },
        },
      },
    },
    next_cursor: { type: ["string", "null"] },
  },
} as const;

export interface SessionsQuery {
  from: string;
  to: string;
  gap_minutes: number;
  user_id?: string;
  cursor?: string;
  limit: number;
}
