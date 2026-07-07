import type { FastifyInstance } from "fastify";
import { serviceUnavailable } from "../errors/problem.js";
import { healthResponseSchema } from "../schemas/health.js";

async function checkPostgres(app: FastifyInstance): Promise<boolean> {
  try {
    await app.pg.query("SELECT 1");
    return true;
  } catch (err) {
    app.log.warn(err, "Postgres health check failed");
    return false;
  }
}

async function checkRedis(app: FastifyInstance): Promise<boolean> {
  try {
    const reply = await app.redis.ping();
    return reply === "PONG";
  } catch (err) {
    app.log.warn(err, "Redis health check failed");
    return false;
  }
}

export function registerHealthRoute(app: FastifyInstance): void {
  app.get(
    "/v1/health",
    { schema: { response: { 200: healthResponseSchema } } },
    async (_request, reply) => {
      const [postgresUp, redisUp] = await Promise.all([checkPostgres(app), checkRedis(app)]);

      if (postgresUp && redisUp) {
        return reply.code(200).send({
          status: "ready",
          checks: { postgres: "up", redis: "up" },
        });
      }

      const down = [!postgresUp && "postgres", !redisUp && "redis"].filter(Boolean).join(", ");
      throw serviceUnavailable(`Not ready: ${down} unreachable.`);
    }
  );
}
