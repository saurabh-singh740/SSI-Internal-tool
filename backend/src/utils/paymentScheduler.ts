/**
 * Payment reminder scheduler.
 *
 * Runs once at startup (to catch any missed windows) and then daily at 01:00 UTC.
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

import cron, { ScheduledTask } from 'node-cron';
import mongoose from 'mongoose';
import { runOverdueCheck } from '../controllers/payment.controller';

const LOCK_NAME   = 'payment-overdue-check';
const LOCK_TTL_MS = 23 * 60 * 60 * 1000; // 23 hours — slightly under the 24h schedule

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
      _id:         LOCK_NAME,
      acquiredAt:  now,
      expiresAt:   new Date(now.getTime() + LOCK_TTL_MS),
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
// Returns the cron task so the caller (index.ts) can stop it on shutdown.

export function startPaymentScheduler(): ScheduledTask {
  // Run immediately on boot to catch any overnight changes
  void tick();

  // Daily at 01:00 UTC — deterministic, avoids midnight race on date rollover
  const task = cron.schedule('0 1 * * *', () => { void tick(); }, { timezone: 'UTC' });

  console.log('[PaymentScheduler] Started — daily overdue check at 01:00 UTC (distributed lock active)');
  return task;
}
