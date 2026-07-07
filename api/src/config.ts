function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 8080),
  host: process.env.HOST ?? "0.0.0.0",
  databaseUrl: required("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/event_analytics"),
  redisUrl: required("REDIS_URL", "redis://localhost:6379"),
  db: {
    maxPoolSize: Number(process.env.DB_POOL_MAX ?? 10),
    idleTimeoutMs: Number(process.env.DB_POOL_IDLE_TIMEOUT_MS ?? 30_000),
    statementTimeoutMs: Number(process.env.DB_STATEMENT_TIMEOUT_MS ?? 5_000),
  },
  ingest: {
    maxBodyBytes: Number(process.env.INGEST_MAX_BODY_BYTES ?? 5 * 1024 * 1024),
  },
} as const;
