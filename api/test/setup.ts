import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { createPool } from "../src/db/pool.js";
import { createRedis } from "../src/redis/client.js";

export interface TestContext {
  app: FastifyInstance;
}

export async function startTestApp(): Promise<TestContext> {
  const pool = createPool();
  const redis = createRedis();
  const app = buildApp({ pool, redis });
  await app.ready();
  return { app };
}

export async function stopTestApp(ctx: TestContext): Promise<void> {
  await ctx.app.close();
  await ctx.app.pg.end();
  ctx.app.redis.disconnect();
}
