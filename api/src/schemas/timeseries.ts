import { fromParamSchema, toParamSchema } from "./common.js";

export const timeseriesQuerySchema = {
  type: "object",
  required: ["from", "to", "bucket"],
  additionalProperties: false,
  properties: {
    from: fromParamSchema,
    to: toParamSchema,
    bucket: { type: "string", enum: ["hour", "day", "week"] },
    event_type: { type: "string" },
  },
} as const;

export const timeseriesResponseSchema = {
  type: "object",
  required: ["bucket", "series"],
  additionalProperties: false,
  properties: {
    bucket: { type: "string", enum: ["hour", "day", "week"] },
    series: {
      type: "array",
      items: {
        type: "object",
        required: ["ts", "count"],
        additionalProperties: false,
        properties: {
          ts: { type: "string", format: "date-time" },
          count: { type: "integer", minimum: 0 },
        },
      },
    },
  },
} as const;

export interface TimeseriesQuery {
  from: string;
  to: string;
  bucket: "hour" | "day" | "week";
  event_type?: string;
}
