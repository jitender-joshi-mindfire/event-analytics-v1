import { fromParamSchema, toParamSchema } from "./common.js";

export const retentionQuerySchema = {
  type: "object",
  required: ["from", "to"],
  additionalProperties: false,
  properties: {
    from: fromParamSchema,
    to: toParamSchema,
    max_weeks: { type: "integer", minimum: 1, maximum: 26, default: 12 },
  },
} as const;

export const retentionResponseSchema = {
  type: "object",
  required: ["cohorts"],
  additionalProperties: false,
  properties: {
    cohorts: {
      type: "array",
      items: {
        type: "object",
        required: ["cohort_week", "size", "retention"],
        additionalProperties: false,
        properties: {
          cohort_week: { type: "string", format: "date" },
          size: { type: "integer", minimum: 0 },
          retention: { type: "array", items: { type: "number", minimum: 0, maximum: 1 } },
        },
      },
    },
  },
} as const;

export interface RetentionQuery {
  from: string;
  to: string;
  max_weeks: number;
}
