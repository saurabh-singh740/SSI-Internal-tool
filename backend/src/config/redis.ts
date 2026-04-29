/**
 * Singleton ioredis client.
 *
 * Returns null when REDIS_URL is not set — all callers must handle this
 * gracefully so the app runs without Redis in development.
 *
 * BullMQ requires { maxRetriesPerRequest: null } — do not remove it.
 */
import Redis from 'ioredis';

let _client: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (!process.env.REDIS_URL) return null;
  if (_client) return _client;

  _client = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null, // required for BullMQ
    enableReadyCheck:     true,
  });

  _client.on('error', (err) => {
    console.error('[Redis] Connection error:', err.message);
  });

  _client.on('ready', () => {
    console.log('[Redis] Connected and ready');
  });

  return _client;
}

export async function closeRedis(): Promise<void> {
  if (_client) {
    try { await _client.quit(); } catch { /* ignore quit errors on shutdown */ }
    _client = null;
  }
}
