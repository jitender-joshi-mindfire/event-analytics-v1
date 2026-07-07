import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import ajvFormats from "ajv-formats";
import type { Plugin } from "ajv";
import type { Pool } from "pg";
import type { Redis } from "ioredis";
import { config } from "./config.js";
import { registerErrorHandler } from "./plugins/errorHandler.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerEventsRoute } from "./routes/events.js";
import { registerTimeseriesRoute } from "./routes/metrics/timeseries.js";
import { registerTopRoute } from "./routes/metrics/top.js";
import { registerLatencyRoute } from "./routes/metrics/latency.js";
import { registerFunnelRoute } from "./routes/metrics/funnel.js";
import { registerRetentionRoute } from "./routes/metrics/retention.js";
import { registerSessionsRoute } from "./routes/sessions.js";

export interface AppDeps {
  pool: Pool;
  redis: Redis;
}

declare module "fastify" {
  interface FastifyInstance {
    pg: Pool;
    redis: Redis;
  }
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({
    logger: true,
    bodyLimit: config.ingest.maxBodyBytes,
    ajv: {
      customOptions: {
        removeAdditional: false,
        allErrors: true,
        coerceTypes: true,
        useDefaults: true,
      },
      // ajv-formats' plugin type is generic over its own options; Fastify's ajv-compiler
      // types the array as Plugin<unknown>, so the cast just bridges two correct-but-mismatched signatures.
      plugins: [ajvFormats as unknown as Plugin<unknown>],
    },
  });

  app.decorate("pg", deps.pool);
  app.decorate("redis", deps.redis);

  // No auth in this project (see REQUIREMENTS.md non-goals), and the
  // dashboard is served from a different origin/port than the API in both
  // dev and docker-compose — permissive CORS is the right call here rather
  // than hardcoding a specific dashboard origin.
  void app.register(cors, { origin: true });

  registerErrorHandler(app);
  registerHealthRoute(app);
  registerEventsRoute(app);
  registerTimeseriesRoute(app);
  registerTopRoute(app);
  registerLatencyRoute(app);
  registerFunnelRoute(app);
  registerRetentionRoute(app);
  registerSessionsRoute(app);

  return app;
}
