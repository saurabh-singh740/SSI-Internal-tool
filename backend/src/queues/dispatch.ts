/**
 * Unified dispatch layer for background jobs.
 *
 * When Redis is available → jobs go to BullMQ (durable, survives restarts).
 * When Redis is absent   → falls back to the in-memory EventEmitter.
 *
 * All controller code calls these dispatch functions, never the emitter directly,
 * so the transport is transparent to callers.
 */
import { getEngineerQueue } from './index';
import {
  appEmitter,
  ProjectEngineersProcessPayload,
  ProjectEngineerAssignPayload,
} from '../events/emitter';

export function dispatchProjectEngineers(payload: ProjectEngineersProcessPayload): void {
  const queue = getEngineerQueue();
  if (queue) {
    queue.add('engineers:process', payload).catch((err) =>
      console.error('[Dispatch] Failed to queue engineers:process:', err.message)
    );
  } else {
    appEmitter.emit('project:engineers:process', payload);
  }
}

export function dispatchEngineerAssign(payload: ProjectEngineerAssignPayload): void {
  const queue = getEngineerQueue();
  if (queue) {
    queue.add('engineer:assign', payload).catch((err) =>
      console.error('[Dispatch] Failed to queue engineer:assign:', err.message)
    );
  } else {
    appEmitter.emit('project:engineer:assign', payload);
  }
}
