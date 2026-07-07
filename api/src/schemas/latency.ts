import { fromParamSchema, toParamSchema } from "./common.js";

export const latencyQuerySchema = {
  type: "object",
  required: ["from", "to"],
  additionalProperties: false,
  properties: {
    from: fromParamSchema,
    to: toParamSchema,
    field: { type: "string", minLength: 1, default: "latency_ms" },
    event_type: { type: "string" },
  },
} as const;

export const latencyResponseSchema = {
  type: "object",
  required: ["field", "count", "p50", "p90", "p95", "p99"],
  additionalProperties: false,
  properties: {
    field: { type: "string" },
    count: { type: "integer", minimum: 0 },
    p50: { type: "number" },
    p90: { type: "number" },
    p95: { type: "number" },
    p99: { type: "number" },
  },
} as const;

export interface LatencyQuery {
  from: string;
  to: string;
  field: string;
  event_type?: string;
}
