import rateLimit from 'express-rate-limit';
import { AuthRequest } from './auth.middleware';

// ── Auth rate limiter ─────────────────────────────────────────────────────────
// Applied to POST /login and POST /register.
// Prevents brute-force credential attacks.
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 20 : 1000,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { message: 'Too many attempts, please try again later.' },
  skip: () => process.env.NODE_ENV === 'test',
});

// ── General API rate limiter ──────────────────────────────────────────────────
// Applied to all /api/* routes as a broad abuse guard.
// IP-based — appropriate for unauthenticated/anonymous requests.
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { message: 'Too many requests, please slow down.' },
  skip: () => process.env.NODE_ENV === 'test',
});

// ── Per-user write limiter ────────────────────────────────────────────────────
// Applied to high-impact mutations: project create/update, payment create/update.
//
// WHY USER-BASED instead of IP-based:
//   On Render (and any deployment behind a proxy/CDN), all users share the
//   same proxy IP. An IP-based limiter would throttle the ENTIRE user base
//   when a single user hammers the API.
//   User-based keying scopes the limit to the individual account.
//
// Falls back to IP for unauthenticated requests (shouldn't reach these routes,
// but safe fallback prevents bypassing by omitting the cookie).
export const perUserWriteLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === 'production' ? 30 : 1000,
  keyGenerator: (req) => {
    const authReq = req as AuthRequest;
    if (authReq.user?.id) return authReq.user.id;
    // Normalize IPv6-mapped IPv4 (e.g. ::ffff:1.2.3.4 → 1.2.3.4)
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    return ip.replace(/^::ffff:/, '');
  },
  validate: { xForwardedForHeader: false },
  standardHeaders: true,
  legacyHeaders:   false,
  message: { message: 'Too many write requests. Please slow down.' },
  skip: () => process.env.NODE_ENV === 'test',
});
