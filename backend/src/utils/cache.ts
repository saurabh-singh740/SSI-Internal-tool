/**
 * Thin Redis cache helpers.
 *
 * All functions are no-ops when Redis is unavailable — callers never need
 * to check for Redis presence themselves.
 */
import { getRedisClient } from '../config/redis';

const DEFAULT_TTL = 60; // seconds

export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedisClient();
  if (!client) return null;
  try {
    const raw = await client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = DEFAULT_TTL): Promise<void> {
  const client = getRedisClient();
  if (!client) return;
  try {
    await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err: any) {
    console.warn('[Cache] set failed:', err.message);
  }
}

export async function cacheDel(...keys: string[]): Promise<void> {
  const client = getRedisClient();
  if (!client) return;
  if (!keys.length) return;
  try {
    await client.del(...keys);
  } catch (err: any) {
    console.warn('[Cache] del failed:', err.message);
  }
}
