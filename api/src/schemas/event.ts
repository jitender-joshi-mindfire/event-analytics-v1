export const eventSchema = {
  type: "object",
  required: ["event_id", "user_id", "event_type", "occurred_at"],
  additionalProperties: false,
  properties: {
    event_id: { type: "string", format: "uuid" },
    user_id: { type: "string", minLength: 1 },
    session_id: { type: ["string", "null"] },
    event_type: { type: "string", minLength: 1 },
    occurred_at: { type: "string", format: "date-time" },
    payload: { type: "object", additionalProperties: true },
  },
} as const;

export const eventBatchBodySchema = {
  type: "object",
  required: ["events"],
  additionalProperties: false,
  properties: {
    events: {
      type: "array",
      minItems: 1,
      maxItems: 5000,
      items: eventSchema,
    },
  },
} as const;

export interface EventInput {
  event_id: string;
  user_id: string;
  session_id?: string | null;
  event_type: string;
  occurred_at: string;
  payload?: Record<string, unknown>;
}

export interface EventBatchInput {
  events: EventInput[];
}
