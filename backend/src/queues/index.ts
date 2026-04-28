/**
 * BullMQ queue definitions.
 *
 * Queues are null when Redis is not available.
 * Callers fall back to in-memory EventEmitter in that case.
 */
import { Queue } from 'bullmq';
import { getRedisClient } from '../config/redis';

let _engineerQueue: Queue | null = null;

export function getEngineerQueue(): Queue | null {
  const client = getRedisClient();
  if (!client) return null;
  if (_engineerQueue) return _engineerQueue;

  _engineerQueue = new Queue('engineer-processing', {
    connection: client,
    defaultJobOptions: {
      attempts:          3,
      backoff:           { type: 'exponential', delay: 2000 },
      removeOnComplete:  100,
      removeOnFail:      200,
    },
  });

  console.log('[BullMQ] engineer-processing queue initialised');
  return _engineerQueue;
}

export async function closeQueues(): Promise<void> {
  if (_engineerQueue) {
    try { await _engineerQueue.close(); } catch { /* ignore */ }
    _engineerQueue = null;
  }
}
