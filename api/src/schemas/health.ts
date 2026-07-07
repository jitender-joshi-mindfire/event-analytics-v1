export const healthResponseSchema = {
  type: "object",
  required: ["status", "checks"],
  additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["ready", "degraded"] },
    checks: {
      type: "object",
      required: ["postgres", "redis"],
      additionalProperties: false,
      properties: {
        postgres: { type: "string", enum: ["up", "down"] },
        redis: { type: "string", enum: ["up", "down"] },
      },
    },
  },
} as const;
