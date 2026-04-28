/**
 * BullMQ worker for engineer background processing.
 *
 * Processes two job types from the 'engineer-processing' queue:
 *   - 'engineers:process'  — fan-out on project creation
 *   - 'engineer:assign'    — single engineer assignment / resend
 *
 * The actual business logic lives in projectHandler.ts — this file is just
 * the BullMQ transport wrapper.  No logic duplication.
 *
 * Only activated when REDIS_URL is set.  When Redis is absent the in-memory
 * EventEmitter handlers in projectHandler.ts handle the same work.
 */
import { Worker, Job } from 'bullmq';
import { getRedisClient } from '../../config/redis';
import { handleProjectCreated, handleEngineerAssign } from '../../events/handlers/projectHandler';
import {
  ProjectEngineersProcessPayload,
  ProjectEngineerAssignPayload,
} from '../../events/emitter';

let _worker: Worker | null = null;

export function startEngineerWorker(): Worker | null {
  const client = getRedisClient();
  if (!client) {
    console.log('[EngineerWorker] Redis not configured — using in-memory EventEmitter fallback');
    return null;
  }

  _worker = new Worker(
    'engineer-processing',
    async (job: Job) => {
      if (job.name === 'engineers:process') {
        await handleProjectCreated(job.data as ProjectEngineersProcessPayload);
      } else if (job.name === 'engineer:assign') {
        await handleEngineerAssign(job.data as ProjectEngineerAssignPayload);
      } else {
        console.warn('[EngineerWorker] Unknown job name:', job.name);
      }
    },
    {
      connection: client,
      concurrency: 5,
    }
  );

  _worker.on('completed', (job) => {
    console.log(`[EngineerWorker] Job ${job.id} (${job.name}) completed`);
  });

  _worker.on('failed', (job, err) => {
    console.error(`[EngineerWorker] Job ${job?.id} (${job?.name}) failed:`, err.message);
  });

  console.log('[EngineerWorker] Started — concurrency: 5');
  return _worker;
}

export async function closeEngineerWorker(): Promise<void> {
  if (_worker) {
    try { await _worker.close(); } catch { /* ignore */ }
    _worker = null;
  }
}
