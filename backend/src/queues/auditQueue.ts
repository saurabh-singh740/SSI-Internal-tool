/**
 * BullMQ audit-logs queue.
 *
 * When Redis is available, audit writes are decoupled from the HTTP response:
 *   Controller → auditLogger() → queue.add() → returns instantly
 *   AuditWorker picks up job → writes to MongoDB (up to 3 retries)
 *
 * When Redis is NOT available, auditLogger falls back to a direct async
 * MongoDB write (fire-and-forget, same non-blocking guarantee).
 *
 * Job priority: CRITICAL events get priority 1 (processed first),
 * all others get priority 10 so critical events are never buried.
 */
import { Queue } from 'bullmq';
import { AuditModule, AuditSeverity } from '../models/AuditLog';

// ── Job payload (all ObjectIds serialized as strings for JSON transport) ──────

export interface AuditJobPayload {
  action:       string;
  module:       AuditModule;
  severity:     AuditSeverity;
  actorId?:     string;         // string, not ObjectId (JSON-safe)
  actorEmail:   string;
  actorRole:    string;
  entityId?:    string;
  entityLabel?: string;
  oldValues?:   Record<string, unknown>;
  newValues?:   Record<string, unknown>;
  metadata?:    Record<string, unknown>;
  ipAddress?:   string;
  userAgent?:   string;
  requestId?:   string;
}

// ── Singleton queue ───────────────────────────────────────────────────────────

let _auditQueue: Queue<AuditJobPayload> | null = null;

function bullmqConnection() {
  return {
    url:                  process.env.REDIS_URL!,
    maxRetriesPerRequest: null as null,  // required by BullMQ workers
    enableReadyCheck:     false,
    retryStrategy:        (times: number) => Math.min(times * 500, 10_000),
  };
}

export function getAuditQueue(): Queue<AuditJobPayload> | null {
  if (!process.env.REDIS_URL) return null;
  if (_auditQueue) return _auditQueue;

  _auditQueue = new Queue<AuditJobPayload>('audit-logs', {
    connection: bullmqConnection(),
    defaultJobOptions: {
      attempts:         3,
      backoff:          { type: 'exponential', delay: 1_000 },
      // Keep the last 1000 completed + 500 failed jobs for debugging
      removeOnComplete: 1_000,
      removeOnFail:     500,
    },
  });

  // BullMQ Queue is an EventEmitter — must attach error handler or Node crashes
  _auditQueue.on('error', (err) => {
    console.error('[AuditQueue] Connection error:', err.message);
  });

  console.log('[BullMQ] audit-logs queue initialised');
  return _auditQueue;
}

export async function closeAuditQueue(): Promise<void> {
  if (_auditQueue) {
    try { await _auditQueue.close(); } catch { /* ignore shutdown errors */ }
    _auditQueue = null;
  }
}
