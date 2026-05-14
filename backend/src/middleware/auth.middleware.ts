/**
 * Authentication and authorization middleware.
 *
 * THREE-LAYER DESIGN:
 *
 * 1. protect()
 *    — Decodes the JWT cookie (no DB hit when Redis has the tokenVersion cached).
 *    — Validates tokenVersion against Redis cache (5-min TTL) or DB on cache miss.
 *    — tokenVersion check: if the user logged out or changed their password since
 *      this token was issued, the version won't match and the request is rejected.
 *    — Tokens issued before this field was added (tokenVersion = undefined) are
 *      treated as backward-compatible and skip the version check.
 *    — Cost: ~0.1ms (JWT decode) + ~0.3ms (Redis GET) on the fast path.
 *
 * 2. requireRole(...roles)
 *    — Fetches the user's CURRENT role from Redis cache (5-min TTL), falling back
 *      to a DB lookup on cache miss.
 *    — DB hit only occurs once every 5 minutes per user (not per request).
 *    — Updates req.user.role with the fresh value for downstream controllers.
 *    — Cost: ~0.3ms (Redis GET hit) or ~1-2ms (DB lookup on miss).
 *
 * Performance at 1000 concurrent users:
 *   Before: every requireRole call → DB query → N queries/minute
 *   After:  every requireRole call → Redis GET (cache hit) → ~0 extra DB load
 *
 * Security invariants:
 *   • Role demotion takes effect within 5 minutes (cache TTL)
 *   • Logout/password-change invalidates sessions immediately via tokenVersion
 *   • Deleted accounts are caught on the next cache miss (within 5 min)
 */
import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from '../utils/jwt';
import { cacheGet, cacheSet } from '../utils/cache';
import User from '../models/User';

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

const ROLE_CACHE_TTL_SECONDS = 300; // 5 minutes — matches the security/perf trade-off
const TV_CACHE_TTL_SECONDS   = 300; // 5 minutes for tokenVersion cache

// ── protect: JWT decode + tokenVersion validation ─────────────────────────────

export const protect = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = req.cookies?.token;
    if (!token) {
      res.status(401).json({ message: 'Not authorized, no token' });
      return;
    }

    const decoded = verifyToken(token);
    req.user = decoded;

    // ── tokenVersion validation ───────────────────────────────────────────────
    // Only validate for tokens that carry the version field.
    // Tokens issued before this feature was deployed (version = undefined)
    // are accepted as-is for backward compatibility — they will naturally
    // expire within 7 days, after which all sessions require the check.
    if (decoded.tokenVersion !== undefined) {
      const cacheKey = `user:tv:${decoded.id}`;

      // Fast path: Redis cache hit (~0.3ms)
      let currentVersion = await cacheGet<number>(cacheKey);

      if (currentVersion === null) {
        // Cache miss: fetch from DB and prime the cache
        const user = await User
          .findById(decoded.id)
          .select('tokenVersion')
          .lean<{ tokenVersion?: number }>();

        if (!user) {
          // User was deleted after the token was issued
          res.status(401).json({ message: 'Account no longer exists' });
          return;
        }

        currentVersion = user.tokenVersion ?? 0;
        await cacheSet(cacheKey, currentVersion, TV_CACHE_TTL_SECONDS);
      }

      if (decoded.tokenVersion !== currentVersion) {
        // Token was issued before the last logout or password change
        res.status(401).json({ message: 'Session expired. Please log in again.' });
        return;
      }
    }

    next();
  } catch {
    res.status(401).json({ message: 'Not authorized, invalid token' });
  }
};

// ── requireRole: Redis-cached role verification ───────────────────────────────

export const requireRole = (...roles: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      // protect() was not called before requireRole — misconfigured route.
      // Fail safe: reject instead of bypassing auth.
      res.status(401).json({ message: 'Not authenticated' });
      return;
    }

    try {
      const cacheKey = `user:role:${req.user.id}`;

      // Fast path: Redis cache hit (avoids DB query on the hot path)
      let freshRole = await cacheGet<string>(cacheKey);

      if (!freshRole) {
        // Cache miss: fetch CURRENT role from DB.
        // This invalidates stale JWT roles: if an admin was demoted between
        // token issue and this request, they are rejected here, not 7 days later.
        const freshUser = await User
          .findById(req.user.id)
          .select('role')
          .lean<{ role: string }>();

        if (!freshUser) {
          res.status(401).json({ message: 'Account no longer exists' });
          return;
        }

        freshRole = freshUser.role;
        // Cache for 5 minutes — role changes take effect within one TTL window
        await cacheSet(cacheKey, freshRole, ROLE_CACHE_TTL_SECONDS);
      }

      // Overwrite the in-memory role with DB reality for all downstream middleware/controllers
      req.user.role = freshRole;

      if (!roles.includes(freshRole)) {
        res.status(403).json({ message: 'Forbidden: insufficient permissions' });
        return;
      }

      next();
    } catch (err) {
      console.error('[Auth] requireRole check failed:', err);
      res.status(500).json({ message: 'Auth verification failed' });
    }
  };
};
