import type { Redis } from "ioredis";

export const INGEST_RATE_LIMIT_WINDOW_SECONDS = 60;
export const INGEST_RATE_LIMIT_MAX_PER_WINDOW = 120;

// Fixed-window counter: INCR a key namespaced by the current window bucket,
// set its TTL only on the first hit in that window. This is Redis rather
// than an in-memory counter because the limit must hold across however many
// API instances end up behind the same DB — a single overloaded ingest
// window should throttle uniformly, not per-process. The INCR/EXPIRE pair
// isn't atomic (a crash between them would leave a key with no TTL), which
// is an accepted trade-off for a coarse, best-effort limiter — a Lua script
// would close that gap but isn't warranted at this scale.
export function ingestRateLimitKey(now: number = Date.now()): string {
  const bucket = Math.floor(now / 1000 / INGEST_RATE_LIMIT_WINDOW_SECONDS);
  return `ratelimit:ingest:${bucket}`;
}

export async function isIngestRateLimited(redis: Redis): Promise<boolean> {
  const key = ingestRateLimitKey();

  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, INGEST_RATE_LIMIT_WINDOW_SECONDS);
  }

  return count > INGEST_RATE_LIMIT_MAX_PER_WINDOW;
}
