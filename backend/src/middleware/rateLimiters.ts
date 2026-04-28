import rateLimit, { Store } from 'express-rate-limit';
import { AuthRequest } from './auth.middleware';

/**
 * Redis store for rate limiting — activates automatically when REDIS_URL is set.
 *
 * To enable (required for multi-instance / horizontal scaling):
 *   1. npm install rate-limit-redis ioredis
 *   2. Add REDIS_URL=redis://... to your environment
 *
 * Without REDIS_URL the limiters use the default in-memory store (single-instance only).
 * This function never throws — if Redis is misconfigured it falls back to memory silently.
 */
function buildRedisStore(): Store | undefined {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return undefined;

  try {
    // Dynamic requires so the packages are optional — no crash if not installed
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { RedisStore } = require('rate-limit-redis') as { RedisStore: new (opts: any) => Store };
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Redis = require('ioredis') as { new(url: string): any };
    const client = new Redis(redisUrl);
    console.log('[RateLimit] Redis store active — rate limiting is multi-instance safe');
    return new RedisStore({ sendCommand: (...args: string[]) => client.call(...args) });
  } catch {
    console.warn('[RateLimit] REDIS_URL set but rate-limit-redis/ioredis not installed — using memory store');
    return undefined;
  }
}

const redisStore = buildRedisStore();

// ── Auth rate limiter ─────────────────────────────────────────────────────────
// Applied to POST /login, /register, /forgot-password, /reset-password.
// Prevents brute-force credential attacks.
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 20 : 1000,
  store: redisStore,
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
  store: redisStore,
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
  store: redisStore,
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
