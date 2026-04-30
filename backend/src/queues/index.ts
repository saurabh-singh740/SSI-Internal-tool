/**
 * BullMQ queue definitions.
 *
 * Queues are null when Redis is not available.
 * Callers fall back to in-memory EventEmitter in that case.
 *
 * We pass the Redis URL (not the shared ioredis client) so BullMQ manages
 * its own internal connections. Passing a client instance causes BullMQ to
 * call client.duplicate() — the duplicates don't inherit error handlers,
 * which causes unhandled 'error' events that crash the process.
 */
import { Queue } from 'bullmq';

let _engineerQueue: Queue | null = null;

function bullmqConnection() {
  return {
    url:                  process.env.REDIS_URL!,
    maxRetriesPerRequest: null as null,  // required by BullMQ workers
    enableReadyCheck:     false,
    retryStrategy:        (times: number) => Math.min(times * 500, 10_000),
  };
}

export function getEngineerQueue(): Queue | null {
  if (!process.env.REDIS_URL) return null;
  if (_engineerQueue) return _engineerQueue;

  _engineerQueue = new Queue('engineer-processing', {
    connection: bullmqConnection(),
    defaultJobOptions: {
      attempts:          3,
      backoff:           { type: 'exponential', delay: 2000 },
      removeOnComplete:  100,
      removeOnFail:      200,
    },
  });

  // BullMQ Queue is an EventEmitter — must attach error handler or Node crashes
  _engineerQueue.on('error', (err) => {
    console.error('[BullMQ] Queue connection error:', err.message);
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
