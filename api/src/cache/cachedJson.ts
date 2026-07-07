import type { Redis } from "ioredis";

export async function getCachedJson<T>(redis: Redis, key: string): Promise<T | null> {
  const raw = await redis.get(key);
  return raw === null ? null : (JSON.parse(raw) as T);
}

export async function setCachedJson(redis: Redis, key: string, value: unknown, ttlSeconds: number): Promise<void> {
  await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
}
