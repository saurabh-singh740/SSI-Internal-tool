/**
 * requestContext.middleware.ts
 *
 * Attaches per-request metadata to every incoming request BEFORE route handlers run:
 *  • requestId  — UUID for tracing a single request across logs
 *  • clientIp   — real client IP (strips IPv6-mapped IPv4, honors X-Forwarded-For)
 *
 * Both are read by auditLogger.ts to enrich audit log entries without the caller
 * needing to pass them explicitly.  They are also returned in the X-Request-Id
 * response header so the frontend can correlate client-side errors with server logs.
 *
 * MUST be registered AFTER cookieParser() but BEFORE route handlers so that
 * req.requestId and req.clientIp are available inside every controller.
 */
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

// ── Extend Express Request globally so TypeScript knows about these properties ─
// This declaration merges into express.d.ts — no extra import needed in controllers.

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** UUID generated for this specific request — used for log correlation. */
      requestId?: string;
      /** Real client IP, normalised (no ::ffff: prefix). */
      clientIp?:  string;
    }
  }
}

/** Normalise IPv6-mapped IPv4 addresses (::ffff:1.2.3.4 → 1.2.3.4). */
function normalizeIp(raw: string | undefined): string {
  if (!raw) return 'unknown';
  return raw.replace(/^::ffff:/, '').trim();
}

export function requestContextMiddleware(
  req:  Request,
  res:  Response,
  next: NextFunction,
): void {
  req.requestId = randomUUID();

  // X-Forwarded-For may be a comma-separated list when passing through multiple
  // proxies — take the leftmost entry (original client).
  const forwarded = req.headers['x-forwarded-for'];
  const rawIp     = Array.isArray(forwarded)
    ? forwarded[0]
    : (forwarded?.split(',')[0] ?? req.ip ?? req.socket?.remoteAddress);

  req.clientIp = normalizeIp(rawIp);

  // Surface requestId in response headers — useful for correlating browser
  // network-tab errors with server logs without querying the DB.
  res.setHeader('X-Request-Id', req.requestId);

  next();
}
