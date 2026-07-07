import { buildApp } from "./app.js";
import { config } from "./config.js";
import { createPool } from "./db/pool.js";
import { createRedis } from "./redis/client.js";

async function main(): Promise<void> {
  const pool = createPool();
  const redis = createRedis();
  const app = buildApp({ pool, redis });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info(`Received ${signal}, draining and shutting down...`);
    try {
      await app.close(); // stops accepting new requests, drains in-flight ones
      await pool.end();
      redis.disconnect();
      app.log.info("Shutdown complete");
      process.exit(0);
    } catch (err) {
      app.log.error(err, "Error during shutdown");
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await app.listen({ port: config.port, host: config.host });
}

main().catch((err) => {
  console.error("Fatal error starting server", err);
  process.exit(1);
});
