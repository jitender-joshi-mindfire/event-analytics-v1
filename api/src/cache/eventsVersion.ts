import type { Redis } from "ioredis";

const VERSION_KEY = "events:version";

export async function getEventsVersion(redis: Redis): Promise<string> {
  return (await redis.get(VERSION_KEY)) ?? "0";
}

// Bumping this on every successful ingest orphans any cache entry keyed on
// the old version instead of requiring us to enumerate/delete every cached
// range that might overlap the newly-ingested events.
export async function bumpEventsVersion(redis: Redis): Promise<void> {
  await redis.incr(VERSION_KEY);
}
