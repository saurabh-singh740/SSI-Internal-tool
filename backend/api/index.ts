/**
 * backend/api/index.ts — Vercel serverless entry point.
 *
 * Vercel's @vercel/node builder compiles this file with its own TypeScript
 * pipeline (esbuild). It is NOT included in the local tsc build (tsconfig.json
 * covers src/ only), so running `npm run build` locally is still safe.
 *
 * How serverless differs from a long-running server:
 *  1. No persistent process — each request may spin up a fresh instance.
 *  2. setInterval / background tasks are killed between invocations.
 *     → startPaymentScheduler() is NOT called here; use Vercel Cron instead.
 *  3. Filesystem writes are ephemeral — uploaded files are lost on cold start.
 *     → Replace multer disk storage with Vercel Blob / Cloudinary for files.
 */

// Load dotenv first — harmless no-op in Vercel (env vars injected by platform)
import '../src/config/env';

import mongoose from 'mongoose';
import app from '../src/app';

// ── Cached MongoDB connection ─────────────────────────────────────────────────
// Vercel reuses the Node.js runtime across warm invocations within the same
// deployment region.  Caching the Mongoose Promise avoids reconnecting on
// every request and keeps Atlas connection-count within free-tier limits.
//
// The `global` object survives across requests in a warm instance; a fresh
// cold-start gets a new global and opens one connection which is then cached.
declare global {
  // eslint-disable-next-line no-var
  var _mongoConnPromise: Promise<typeof mongoose> | undefined;
}

if (!global._mongoConnPromise) {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('[Vercel] MONGO_URI environment variable is not set. Add it in Project Settings → Environment Variables.');
  }

  global._mongoConnPromise = mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5_000,
    socketTimeoutMS:          45_000,
    // Keep pool small — each serverless instance manages its own pool and
    // multiple concurrent instances must not exhaust Atlas connection limits.
    maxPoolSize: 5,
    minPoolSize: 1,
  });
}

// Kick off the connection; errors surface per-request via the health endpoint.
global._mongoConnPromise.catch(err =>
  console.error('[MongoDB] Serverless connection failed:', err),
);

// Vercel treats any exported default function/object implementing
// (req, res) => void as a valid serverless handler.  Express apps satisfy
// this interface directly.
export default app;
