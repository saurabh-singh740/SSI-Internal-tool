/**
 * Audit log retention scheduler.
 *
 * Complements the per-document TTL index on `expiresAt` with two extra jobs:
 *
 *  1. Legacy cleanup — deletes docs written before `expiresAt` was introduced
 *     (those have no `expiresAt` field) using the RETENTION_DAYS policy.
 *
 *  2. Hard-cap enforcement — if total doc count exceeds AUDIT_MAX_DOCS
 *     (default 500 000), purges the oldest LOW-severity docs until the
 *     collection is back below 80 % of the cap.  HIGH/CRITICAL are never
 *     touched by the cap logic.
 *
 * Schedule: Sundays at 02:00 UTC (low-traffic window).
 * Multi-instance safety: distributed lock stored in `scheduler_locks`.
 */

import cron, { ScheduledTask } from 'node-cron';
import mongoose                from 'mongoose';
import AuditLog, { RETENTION_DAYS, AuditSeverity } from '../models/AuditLog';

// ── Config ────────────────────────────────────────────────────────────────────

const LOCK_NAME    = 'audit-retention-cleanup';
const LOCK_TTL_MS  = 7 * 24 * 60 * 60 * 1000; // 7 days — matches weekly schedule

function maxDocs(): number {
  const v = parseInt(process.env.AUDIT_MAX_DOCS ?? '', 10);
  return isNaN(v) || v < 1000 ? 500_000 : v;
}

// ── Distributed lock ──────────────────────────────────────────────────────────

async function acquireLock(): Promise<boolean> {
  const db = mongoose.connection.db;
  if (!db) return true;

  const col = db.collection<{ _id: string; acquiredAt: Date; expiresAt: Date }>('scheduler_locks');
  const now = new Date();

  await col.deleteOne({ _id: LOCK_NAME, expiresAt: { $lt: now } });

  try {
    await col.insertOne({
      _id:        LOCK_NAME,
      acquiredAt: now,
      expiresAt:  new Date(now.getTime() + LOCK_TTL_MS),
    });
    return true;
  } catch (err: any) {
    if (err.code === 11000) return false;
    console.warn('[AuditRetention] Lock error (allowing run):', err.message);
    return true;
  }
}

// ── Main tick ─────────────────────────────────────────────────────────────────

async function tick(): Promise<void> {
  const acquired = await acquireLock();
  if (!acquired) {
    console.log('[AuditRetention] Lock held by another instance — skipping');
    return;
  }

  console.log('[AuditRetention] Starting weekly retention run…');
  const now = new Date();
  let totalCleaned = 0;

  try {
    // ── 0. Null-severity cleanup: corrupted docs with missing/invalid severity ─
    // These were written before Mongoose enum validation was enforced.
    // Audit logs are immutable (no updates allowed), so we delete them.
    const VALID_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const { deletedCount: nullSevCount } = await (AuditLog as any).deleteMany({
      severity: { $nin: VALID_SEVERITIES },
    });
    if (nullSevCount > 0) {
      console.log(`[AuditRetention] Removed ${nullSevCount} doc(s) with null/invalid severity`);
      totalCleaned += nullSevCount;
    }

    // ── 1. Legacy cleanup: docs without expiresAt ────────────────────────────
    // These were written before this retention system was deployed.
    // Apply the current RETENTION_DAYS policy retroactively.
    for (const [sev, days] of Object.entries(RETENTION_DAYS) as [AuditSeverity, number][]) {
      const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      const { deletedCount } = await (AuditLog as any).deleteMany({
        severity:  sev,
        expiresAt: { $exists: false },
        createdAt: { $lt: cutoff },
      });
      if (deletedCount > 0) {
        console.log(`[AuditRetention] Legacy cleanup: removed ${deletedCount} ${sev} docs (>${days}d old)`);
        totalCleaned += deletedCount;
      }
    }

    // ── 2. Stats report ──────────────────────────────────────────────────────
    const [total, bySeverity] = await Promise.all([
      AuditLog.countDocuments(),
      AuditLog.aggregate([
        { $group: {
          _id:           '$severity',
          count:         { $sum: 1 },
          withExpiry:    { $sum: { $cond: [{ $ifNull: ['$expiresAt', false] }, 1, 0] } },
          nextExpiry:    { $min: '$expiresAt' },
        }},
        { $sort: { count: -1 } },
      ]),
    ]);

    const report = bySeverity
      .map((r: any) => `${r._id}:${r.count}(${r.withExpiry} with TTL)`)
      .join(', ');
    console.log(`[AuditRetention] Total: ${total} docs — ${report}`);

    // ── 3. Hard-cap enforcement ──────────────────────────────────────────────
    // Only purges LOW-severity docs (never HIGH/CRITICAL).
    // Kicks in only when total exceeds the configured max.
    const cap = maxDocs();
    if (total > cap) {
      const targetTotal  = Math.floor(cap * 0.8); // purge down to 80 % of cap
      const excessToPurge = total - targetTotal;

      // Use createdAt cutoff (indexed) instead of skip to avoid O(n) scan
      const cutoffDoc = await AuditLog
        .findOne({ severity: 'LOW' })
        .sort({ createdAt: 1, _id: 1 })
        .select('createdAt')
        .skip(excessToPurge - 1)
        .lean();

      if (cutoffDoc) {
        const { deletedCount } = await (AuditLog as any).deleteMany({
          severity:  'LOW',
          createdAt: { $lte: cutoffDoc.createdAt },
        });
        console.warn(
          `[AuditRetention] Hard cap exceeded (${total}/${cap}) — ` +
          `purged ${deletedCount} LOW docs; target was ${excessToPurge}`,
        );
        totalCleaned += deletedCount;
      } else {
        // No LOW docs to purge — warn admin but don't touch MEDIUM/HIGH/CRITICAL
        console.warn(
          `[AuditRetention] Hard cap exceeded (${total}/${cap}) but no LOW docs ` +
          `available to purge. Consider raising AUDIT_MAX_DOCS or lowering AUDIT_RETENTION_LOW_DAYS.`,
        );
      }
    }

    console.log(`[AuditRetention] Done — total removed this run: ${totalCleaned}`);
  } catch (err) {
    console.error('[AuditRetention] Error during retention run:', err);
  }
}

// ── Start / stop ──────────────────────────────────────────────────────────────

export function startAuditRetentionScheduler(): ScheduledTask {
  // Run once at startup to catch any backlog immediately
  void tick();

  // Weekly on Sundays at 02:00 UTC — low-traffic window
  const task = cron.schedule('0 2 * * 0', () => { void tick(); }, { timezone: 'UTC' });

  console.log('[AuditRetention] Started — weekly run at 02:00 UTC Sunday (distributed lock active)');
  return task;
}
