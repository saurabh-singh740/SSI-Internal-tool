/**
 * Payment reminder scheduler.
 *
 * Runs once at startup (to catch any missed windows) and then every 24 hours.
 *
 * Multi-instance safety: before each tick, acquires a MongoDB advisory lock with
 * a 23-hour TTL.  If another instance already holds the lock (i.e. ran within the
 * past 23 hours), this instance skips the run.  The lock is stored in the
 * "scheduler_locks" collection.
 *
 * Jobs performed:
 *  1. Mark past-due pending/partial payments as "overdue"
 *  2. Create in-app notifications for overdue payments
 *  3. Create in-app notifications for payments due in 3 days
 *  4. Create in-app notifications for payments due in 7 days
 */

import mongoose from 'mongoose';
import { runOverdueCheck } from '../controllers/payment.controller';

const INTERVAL_MS  = 24 * 60 * 60 * 1000; // 24 hours
const LOCK_NAME    = 'payment-overdue-check';
const LOCK_TTL_MS  = 23 * 60 * 60 * 1000; // 23 hours — slightly under interval

// ── Distributed lock helpers ──────────────────────────────────────────────────

async function acquireLock(): Promise<boolean> {
  const db = mongoose.connection.db;
  if (!db) return true; // DB not ready — allow run so we don't silently skip

  const col = db.collection<{ _id: string; acquiredAt: Date; expiresAt: Date }>('scheduler_locks');
  const now = new Date();

  // Remove any expired lock first (atomic on the owning instance)
  await col.deleteOne({ _id: LOCK_NAME, expiresAt: { $lt: now } });

  // Attempt to insert a fresh lock — fails with duplicate-key if another
  // instance already acquired it within the TTL window.
  try {
    await col.insertOne({
      _id: LOCK_NAME,
      acquiredAt: now,
      expiresAt: new Date(now.getTime() + LOCK_TTL_MS),
    });
    return true;
  } catch (err: any) {
    if (err.code === 11000) return false; // Another instance holds the lock
    // Unknown error — allow run to prevent silent failure
    console.warn('[PaymentScheduler] Lock acquisition error (allowing run):', err.message);
    return true;
  }
}

// ── Tick ──────────────────────────────────────────────────────────────────────

async function tick(): Promise<void> {
  const acquired = await acquireLock();
  if (!acquired) {
    console.log('[PaymentScheduler] Lock held by another instance — skipping this tick');
    return;
  }

  try {
    console.log('[PaymentScheduler] Running daily overdue check…');
    const { marked, notified } = await runOverdueCheck();
    console.log(`[PaymentScheduler] Done — marked overdue: ${marked}, notifications sent: ${notified}`);
  } catch (err) {
    console.error('[PaymentScheduler] Error during overdue check:', err);
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────
// Returns the interval handle so the caller (index.ts) can clear it on shutdown.

export function startPaymentScheduler(): ReturnType<typeof setInterval> {
  // Run immediately on boot to catch any overnight changes
  void tick();

  // Then repeat every 24 hours
  const handle = setInterval(() => { void tick(); }, INTERVAL_MS);

  console.log('[PaymentScheduler] Started — daily overdue check enabled (distributed lock active)');
  return handle;
}
