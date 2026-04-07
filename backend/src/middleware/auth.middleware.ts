/**
 * Authentication and authorization middleware.
 *
 * TWO-LAYER DESIGN:
 *
 * 1. protect()
 *    — Fast path. Decodes the JWT cookie only (no DB hit).
 *    — Runs on every authenticated request.
 *    — Attaches decoded payload to req.user.
 *    — Cost: ~0.1ms (crypto only).
 *
 * 2. requireRole(...roles)
 *    — Slow path (one targeted DB query). Only fires on privileged routes.
 *    — Fetches the user's CURRENT role from DB to detect stale JWT roles
 *      (e.g. admin was demoted since their 7-day token was issued).
 *    — Updates req.user.role with the fresh DB value so downstream
 *      controllers always see the current role.
 *    — Cost: ~1-2ms (single _id lookup on primary index, lean).
 *
 * This hybrid avoids:
 *  a) DB hit on every request (bad for performance)
 *  b) Trusting a 7-day stale role in the token (bad for security)
 *
 * Routes that use only `protect` (no requireRole) are low-risk read operations
 * where a briefly-stale role causes no harm (e.g. GET /notifications).
 * Routes that gate on role (ADMIN-only mutations) always call requireRole.
 */
import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from '../utils/jwt';
import User from '../models/User';

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

// ── protect: JWT decode only ──────────────────────────────────────────────────

export const protect = (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const token = req.cookies?.token;
    if (!token) {
      res.status(401).json({ message: 'Not authorized, no token' });
      return;
    }
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: 'Not authorized, invalid token' });
  }
};

// ── requireRole: JWT decode + targeted DB role verification ──────────────────

export const requireRole = (...roles: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    // 1. Token must be present and valid (same check as protect)
    if (!req.user) {
      // protect() was not called before requireRole — this is a misconfigured route.
      // Fail safe: reject instead of bypassing auth.
      res.status(401).json({ message: 'Not authenticated' });
      return;
    }

    try {
      // 2. Fetch CURRENT role from DB (single field, lean — ~1ms on primary index)
      //    This invalidates stale JWT roles: if an admin was demoted between
      //    token issue and this request, they are rejected here, not 7 days later.
      const freshUser = await User
        .findById(req.user.id)
        .select('role')
        .lean<{ role: string }>();

      if (!freshUser) {
        // User was deleted after the token was issued
        res.status(401).json({ message: 'Account no longer exists' });
        return;
      }

      // Overwrite the in-memory role with DB reality for all downstream middleware/controllers
      req.user.role = freshUser.role;

      // 3. Enforce the required role(s)
      if (!roles.includes(freshUser.role)) {
        res.status(403).json({ message: 'Forbidden: insufficient permissions' });
        return;
      }

      next();
    } catch (err) {
      console.error('[Auth] requireRole DB check failed:', err);
      res.status(500).json({ message: 'Auth verification failed' });
    }
  };
};
