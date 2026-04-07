/**
 * MUST be the first import in index.ts.
 *
 * Calling dotenv.config() here — inside its own module — guarantees it runs
 * before any other module's top-level code reads process.env.
 * In CommonJS (which TypeScript compiles to) require() calls are sequential,
 * so importing this file first ensures the .env values are populated before
 * emailService.ts, auth.ts, or any other module captures them into constants.
 */
import dotenv from 'dotenv';

dotenv.config();

// ── Required env-var validation — fail fast before any module initialises ─────
const REQUIRED_VARS: string[] = ['MONGO_URI', 'JWT_SECRET'];

const missing = REQUIRED_VARS.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`[Env] FATAL: Missing required environment variables: ${missing.join(', ')}`);
  console.error('[Env] Set them in backend/.env before starting the server.');
  process.exit(1);
}

// Warn (not fatal) about JWT_SECRET length — weak secrets are exploitable
const jwtSecret = process.env.JWT_SECRET!;
if (jwtSecret.length < 32) {
  console.warn('[Env] WARNING: JWT_SECRET is shorter than 32 characters — use a stronger secret in production');
}

// ── Startup env-var log (safe – no secrets printed) ──────────────────────────
console.log('[Env] NODE_ENV   :', process.env.NODE_ENV  || '(not set)');
console.log('[Env] MONGO_URI  :', process.env.MONGO_URI ? '✓ set' : '⚠  NOT SET');
console.log('[Env] JWT_SECRET :', process.env.JWT_SECRET ? `✓ set (${jwtSecret.length} chars)` : '⚠  NOT SET');
console.log('[Env] EMAIL_USER :', process.env.EMAIL_USER
  ? `${process.env.EMAIL_USER.slice(0, 4)}…` // print only first 4 chars
  : '⚠  NOT SET');
console.log('[Env] EMAIL_PASS :', process.env.EMAIL_PASS ? '✓ set' : '⚠  NOT SET');
console.log('[Env] APP_BASE_URL:', process.env.APP_BASE_URL || 'http://localhost:5173 (default)');
