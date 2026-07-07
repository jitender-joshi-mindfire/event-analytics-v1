import { cursorParamSchema, fromParamSchema, limitParamSchema, toParamSchema } from "./common.js";

export const topQuerySchema = {
  type: "object",
  required: ["from", "to", "dimension"],
  additionalProperties: false,
  properties: {
    from: fromParamSchema,
    to: toParamSchema,
    dimension: { type: "string", minLength: 1 },
    group_by: { type: "string", minLength: 1 },
    metric: { type: "string", enum: ["count", "sum_amount", "unique_users"], default: "count" },
    n: { type: "integer", minimum: 1, maximum: 100, default: 10 },
    cursor: cursorParamSchema,
    limit: limitParamSchema,
  },
} as const;

export const topResponseSchema = {
  type: "object",
  required: ["rows"],
  additionalProperties: false,
  properties: {
    rows: {
      type: "array",
      items: {
        type: "object",
        required: ["entity", "rank", "value"],
        additionalProperties: false,
        properties: {
          group: { type: ["string", "null"] },
          entity: { type: "string" },
          rank: { type: "integer", minimum: 1 },
          value: { type: "number" },
        },
      },
    },
    next_cursor: { type: ["string", "null"] },
  },
} as const;

export type TopMetric = "count" | "sum_amount" | "unique_users";

export interface TopQuery {
  from: string;
  to: string;
  dimension: string;
  group_by?: string;
  metric: TopMetric;
  n: number;
  cursor?: string;
  limit: number;
}
