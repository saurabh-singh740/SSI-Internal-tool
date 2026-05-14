import rateLimit, { Store } from 'express-rate-limit';
import { getRedisClient }   from '../config/redis';
import { AuthRequest }      from './auth.middleware';

/**
 * makeRedisStore — creates ONE fresh store instance per call.
 *
 * WHY A FACTORY INSTEAD OF A SINGLETON:
 *   express-rate-limit v7+ forbids sharing a single Store instance across multiple
 *   rateLimit() calls (ERR_ERL_STORE_REUSE).  Each limiter needs its own store
 *   so its key namespace and window counters remain isolated.
 *
 *   We reuse the shared ioredis client (from config/redis.ts) — no extra connections.
 *   The `prefix` parameter namespaces the Redis keys so each limiter's counters
 *   don't collide (e.g. "rl:auth:" vs "rl:api:" vs "rl:write:").
 *
 * Falls back silently to undefined (in-memory store) when:
 *   • REDIS_URL is not set
 *   • rate-limit-redis is not installed
 *   • Redis client is not yet ready
 */
function makeRedisStore(prefix: string): Store | undefined {
  const client = getRedisClient();
  if (!client) return undefined;

  try {
    // Dynamic require — rate-limit-redis is an optional peer dependency.
    // The app works without it (falls back to per-instance in-memory store).
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { RedisStore } = require('rate-limit-redis') as {
      RedisStore: new (opts: Record<string, unknown>) => Store;
    };

    const store = new RedisStore({
      // Reuse the existing shared ioredis connection — no extra TCP connections
      sendCommand: (...args: string[]) => (client as any).call(...args),
      prefix,
    });

    console.log(`[RateLimit] Redis store active for prefix "${prefix}"`);
    return store;
  } catch {
    console.warn(
      `[RateLimit] rate-limit-redis not installed for prefix "${prefix}" — using memory store. ` +
      'Run: npm install rate-limit-redis',
    );
    return undefined;
  }
}

// ── Auth rate limiter ─────────────────────────────────────────────────────────
// Applied to POST /login, /register, /forgot-password, /reset-password.
// Prevents brute-force credential attacks and account enumeration.
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 20 : 1000,
  // Each limiter gets its own store instance — never share stores between limiters
  store: makeRedisStore('rl:auth:'),
  standardHeaders: true,
  legacyHeaders:   false,
  message: { message: 'Too many attempts, please try again later.' },
  skip: () => process.env.NODE_ENV === 'test',
});

// ── General API rate limiter ──────────────────────────────────────────────────
// Applied to all /api/* routes as a broad abuse guard. IP-based.
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  store: makeRedisStore('rl:api:'),
  standardHeaders: true,
  legacyHeaders:   false,
  message: { message: 'Too many requests, please slow down.' },
  skip: () => process.env.NODE_ENV === 'test',
});

// ── Per-user write limiter ────────────────────────────────────────────────────
// Applied to high-impact mutations: project create/update, payment create/update.
//
// WHY USER-BASED instead of IP-based:
//   On Render (and behind any proxy/CDN), all users share the same proxy IP.
//   An IP-based limiter would throttle the ENTIRE user base when one user hammers.
//   User-based keying scopes the limit to the individual account.
export const perUserWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 30 : 1000,
  store: makeRedisStore('rl:write:'),
  keyGenerator: (req) => {
    const authReq = req as AuthRequest;
    if (authReq.user?.id) return authReq.user.id;
    // Normalize IPv6-mapped IPv4 (::ffff:1.2.3.4 → 1.2.3.4)
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    return ip.replace(/^::ffff:/, '');
  },
  validate: { xForwardedForHeader: false },
  standardHeaders: true,
  legacyHeaders:   false,
  message: { message: 'Too many write requests. Please slow down.' },
  skip: () => process.env.NODE_ENV === 'test',
});
