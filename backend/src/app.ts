/**
 * backend/src/app.ts
 *
 * Express application — no app.listen(), no DB connection, no scheduler.
 * Imported by:
 *   • src/index.ts  → local dev / production server
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';

import { apiRateLimiter } from './middleware/rateLimiters';
import authRoutes         from './routes/auth.routes';
import projectRoutes      from './routes/project.routes';
import userRoutes         from './routes/user.routes';
import timesheetRoutes    from './routes/timesheet.routes';
import notificationRoutes from './routes/notification.routes';
import paymentRoutes      from './routes/payment.routes';
import dealRoutes         from './modules/presales/routes/deal.routes';
import partnerRoutes      from './modules/presales/routes/partner.routes';
import attachmentRoutes   from './modules/presales/routes/attachment.routes';
import { testEmail }      from './controllers/engineer.controller';
import { protect, requireRole } from './middleware/auth.middleware';
import { globalErrorHandler }   from './middleware/errorHandler';

const app = express();

// ── Trust reverse-proxy headers ───────────────────────────────────────────────
// Required on Vercel (and behind any load-balancer/CDN) so express-rate-limit
// sees the real client IP from X-Forwarded-For instead of the proxy address.
app.set('trust proxy', 1);

// ── Security headers ──────────────────────────────────────────────────────────
// contentSecurityPolicy is disabled so Vite's hashed module scripts load
// without "Refused to execute inline script" errors.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// ── CORS ──────────────────────────────────────────────────────────────────────
// With unified deployment, browser requests are same-origin so CORS is not
// triggered for production traffic.  We still configure it for:
//   • Local dev: Vite dev server (localhost:5173) proxies to this Express app
//   • Any external tool (Postman, curl, staging environments)
//
// localhost origins are always permitted — they are not internet-accessible
// so there is no security risk in hardcoding them here.
const envOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const allowedOrigins = [
  ...new Set([
    'http://localhost:5173',
    'http://localhost:5174',
    'https://ssi-project-tracker.onrender.com',
    ...envOrigins,
  ]),
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, Postman, server-to-server)
      // and any whitelisted origin including the production domain.
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  }),
);

// ── Body parsers & cookies ────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// ── NoSQL injection protection ────────────────────────────────────────────────
app.use(mongoSanitize());

// ── CSRF protection ───────────────────────────────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  const MUTATING = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!MUTATING.includes(req.method)) return next();
  const origin = req.headers.origin ?? req.headers.referer;
  if (!origin) return next();
  const serverOrigin = `${req.protocol}://${req.get('host')}`;
  const ok = allowedOrigins.some(o => origin.startsWith(o)) || origin.startsWith(serverOrigin);
  if (!ok) {
    res.status(403).json({ message: 'CSRF check failed: origin not allowed' });
    return;
  }
  next();
});

// /uploads static serving removed — files are stored as base64 data URLs
// inside MongoDB attachment subdocs (see project.routes.ts).  For CDN-served
// files, integrate Vercel Blob (@vercel/blob) or Cloudinary and store the
// returned URL in the attachment.url field instead.

// ── Rate limiting ─────────────────────────────────────────────────────────────
// ⚠ In-memory store — works per-instance only.  For multi-instance production
//   deployments, swap the store for Upstash Redis (@upstash/ratelimit).
app.use('/api/', apiRateLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/projects',      projectRoutes);
app.use('/api/users',         userRoutes);
app.use('/api/timesheets',    timesheetRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/payments',      paymentRoutes);
app.use('/api/deals',                  dealRoutes);
app.use('/api/deals/:id/attachments',  attachmentRoutes);
app.use('/api/partners',               partnerRoutes);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req: Request, res: Response) => {
  const dbState = mongoose.connection.readyState;
  const dbOk    = dbState === 1;
  res.status(dbOk ? 200 : 503).json({
    status:      dbOk ? 'ok' : 'degraded',
    db:          dbOk ? 'connected' : 'disconnected',
    uptime:      Math.floor(process.uptime()),
    environment: process.env.NODE_ENV,
    ts:          new Date().toISOString(),
  });
});

// ── Test email (admin-only dev helper) ────────────────────────────────────────
app.post('/api/test-email', protect, requireRole('ADMIN'), testEmail);

// ── API 404 — unknown /api/* routes return JSON, not the React app ───────────
app.use('/api', (_req: Request, res: Response) => {
  res.status(404).json({ message: 'Route not found' });
});

// ── Serve React frontend (production unified build) ───────────────────────────
// Build chain: src/app.ts → dist/app.js  (__dirname = backend/dist/)
// api/index.ts is Vercel-only and NOT compiled by tsc — no dist/api/ exists.
// public/ is one level up: path.join(__dirname, '../public') = backend/public/



// Debug — visible in Render Logs tab to confirm paths at runtime
console.log('[static] cwd        :', process.cwd());
console.log('[static] __dirname  :', __dirname);
console.log('[static] PUBLIC_DIR :', __dirname, '../public');
console.log('[static] dir exists :', fs.existsSync(path.join(__dirname, '../public')));
console.log('[static] index.html :', fs.existsSync(path.join(__dirname, '../public/index.html')));

// Vite emits all JS/CSS/image assets into /assets/ with content-hash filenames.
// These can be cached forever — if the content changes the filename changes too.
app.use(
  '/assets',
  express.static(path.join(__dirname, '../public/assets'), {
    maxAge:    '1y',
    immutable: true,
  }),
);

// All other static files (favicon, robots.txt, manifest, etc.) — short cache.
app.use(
  express.static(path.join(__dirname, '../public'), {
    maxAge: '1h',
    index:  false,  // Never auto-serve index.html — handled explicitly below
  }),
);

// SPA fallback — index.html must NEVER be cached so the browser always gets
// the latest asset filenames after a deploy.
app.get('*', (_req: Request, res: Response) => {
  res
    .setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    .setHeader('Pragma', 'no-cache')
    .setHeader('Expires', '0')
    .sendFile(path.join(__dirname, '../public/index.html'));
});

// ── Global error handler (must be registered last) ───────────────────────────
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  globalErrorHandler(err, req, res, next);
});

export default app;
