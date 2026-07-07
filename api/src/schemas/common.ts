export const fromParamSchema = { type: "string", format: "date-time" } as const;
export const toParamSchema = { type: "string", format: "date-time" } as const;
export const cursorParamSchema = { type: "string" } as const;
export const limitParamSchema = { type: "integer", minimum: 1, maximum: 1000, default: 100 } as const;

export interface RangeQuery {
  from: string;
  to: string;
}
