import { fromParamSchema, toParamSchema } from "./common.js";

// Permissive ISO-8601 duration shape (PnYnMnWnDTnHnMnS); Postgres itself is
// the final authority on whether the value is a valid interval — an invalid
// cast is caught and reported as a 400 in the route handler.
const ISO_DURATION_PATTERN = "^P(\\d+Y)?(\\d+M)?(\\d+W)?(\\d+D)?(T(\\d+H)?(\\d+M)?(\\d+S)?)?$";

export const funnelQuerySchema = {
  type: "object",
  required: ["from", "to", "steps"],
  additionalProperties: false,
  properties: {
    from: fromParamSchema,
    to: toParamSchema,
    steps: { type: "string", minLength: 1 },
    window: { type: "string", pattern: ISO_DURATION_PATTERN, default: "P7D" },
  },
} as const;

export const funnelResponseSchema = {
  type: "object",
  required: ["window", "steps"],
  additionalProperties: false,
  properties: {
    window: { type: "string" },
    steps: {
      type: "array",
      items: {
        type: "object",
        required: ["step", "users", "conversion_from_prev"],
        additionalProperties: false,
        properties: {
          step: { type: "string" },
          users: { type: "integer", minimum: 0 },
          conversion_from_prev: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
  },
} as const;

export interface FunnelQuery {
  from: string;
  to: string;
  steps: string;
  window: string;
}
