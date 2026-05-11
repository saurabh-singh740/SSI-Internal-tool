/**
 * BullMQ worker for the 'audit-logs' queue.
 *
 * Picks up AuditJobPayload jobs and writes them to the AuditLog MongoDB collection.
 * Retries up to 3 times with exponential backoff on failure (queue defaultJobOptions).
 *
 * Only started when REDIS_URL is set.  When Redis is absent, auditLogger.ts
 * writes directly to MongoDB (same non-blocking guarantee, no durability).
 *
 * Concurrency is intentionally low (3) — audit writes are not latency-sensitive
 * and we don't want to saturate MongoDB write capacity.
 */
import { Worker, Job }    from 'bullmq';
import mongoose           from 'mongoose';
import AuditLog           from '../../models/AuditLog';
import { AuditJobPayload } from '../auditQueue';

let _worker: Worker<AuditJobPayload> | null = null;

export function startAuditWorker(): Worker<AuditJobPayload> | null {
  if (!process.env.REDIS_URL) {
    console.log('[AuditWorker] Redis not configured — using direct MongoDB writes');
    return null;
  }

  _worker = new Worker<AuditJobPayload>(
    'audit-logs',
    async (job: Job<AuditJobPayload>) => {
      const { actorId, ...rest } = job.data;

      await AuditLog.create({
        ...rest,
        // Re-hydrate actorId string → ObjectId for proper DB storage + populate
        actorId: actorId ? new mongoose.Types.ObjectId(actorId) : undefined,
      });
    },
    {
      // Pass URL (not shared ioredis instance) — shared instances get duplicated
      // by BullMQ without inheriting error handlers → unhandled 'error' events.
      connection: {
        url:                  process.env.REDIS_URL,
        maxRetriesPerRequest: null as null,
        enableReadyCheck:     false,
        retryStrategy:        (times: number) => Math.min(times * 500, 10_000),
      },
      concurrency: 3,
    }
  );

  _worker.on('error', (err) => {
    console.error('[AuditWorker] Worker error:', err.message);
  });

  _worker.on('failed', (job, err) => {
    // After all retries exhausted — log the dropped audit entry so it's visible
    // in Render logs even if MongoDB is temporarily unavailable.
    console.error(
      `[AuditWorker] Job ${job?.id} permanently failed after ${job?.attemptsMade} attempts:`,
      err.message,
      '| Data:', JSON.stringify(job?.data).slice(0, 300),
    );
  });

  console.log('[AuditWorker] Started — concurrency: 3');
  return _worker;
}

export async function closeAuditWorker(): Promise<void> {
  if (_worker) {
    try { await _worker.close(); } catch { /* ignore */ }
    _worker = null;
  }
}
