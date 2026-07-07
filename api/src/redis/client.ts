import { Redis } from "ioredis";
import { config } from "../config.js";

export function createRedis(): Redis {
  const redis = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 2,
    lazyConnect: false,
  });

  redis.on("error", (err) => {
    // A transient Redis outage must not crash the process; /v1/health will report it.
    console.error("Redis client error", err);
  });

  return redis;
}
