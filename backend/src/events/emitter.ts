/**
 * Typed application-wide EventEmitter.
 *
 * Defines the full event map for compile-time safety — the TS compiler
 * catches mismatched payloads before they reach production.
 *
 * UPGRADE PATH TO BULLMQ (when you add Redis):
 *   Replace `projectEmitter.emit(...)` in controllers with:
 *     await projectQueue.add('project:engineers:process', payload, {
 *       attempts: 3,
 *       backoff: { type: 'exponential', delay: 2000 },
 *     });
 *   And replace the `projectEmitter.on(...)` handler with a BullMQ Worker.
 *   The handler function body is IDENTICAL — no business logic changes.
 */
import { EventEmitter } from 'events';

// ── Event payload types ───────────────────────────────────────────────────────

export interface ProjectEngineersProcessPayload {
  projectId:            string;
  projectName:          string;
  clientName:           string;
  engineerIds:          string[];
  year:                 number;
  totalAuthorizedHours: number;
}

export interface ProjectEngineerAssignPayload {
  projectId:            string;
  projectName:          string;
  clientName:           string;
  engineerId:           string;
  year:                 number;
  totalAuthorizedHours: number;
  /** If true, engineer was already assigned — re-send email only */
  resend:               boolean;
}

// ── Pre-Sales event payload types ─────────────────────────────────────────────

export interface DealStageChangedPayload {
  dealId:    string;
  dealTitle: string;
  fromStage: string;
  toStage:   string;
  actorId:   string;
  ownerId:   string;
  teamIds:   string[];
}

export interface DealConvertedPayload {
  dealId:    string;
  dealTitle: string;
  projectId: string;
  actorId:   string;
  ownerId:   string;
}

export interface DealMentionedPayload {
  dealId:      string;
  mentionedId: string;
  actorId:     string;
  context:     string;
}

// ── Typed emitter class ───────────────────────────────────────────────────────

interface AppEventMap {
  'project:engineers:process':  [ProjectEngineersProcessPayload];
  'project:engineer:assign':    [ProjectEngineerAssignPayload];
  'deal:stage:changed':         [DealStageChangedPayload];
  'deal:converted':             [DealConvertedPayload];
  'deal:mentioned':             [DealMentionedPayload];
}

class AppEmitter extends EventEmitter {
  emit<K extends keyof AppEventMap>(event: K, ...args: AppEventMap[K]): boolean {
    return super.emit(event as string, ...args);
  }

  on<K extends keyof AppEventMap>(
    event: K,
    listener: (...args: AppEventMap[K]) => void
  ): this {
    return super.on(event as string, listener as (...args: unknown[]) => void);
  }

  once<K extends keyof AppEventMap>(
    event: K,
    listener: (...args: AppEventMap[K]) => void
  ): this {
    return super.once(event as string, listener as (...args: unknown[]) => void);
  }
}

export const appEmitter = new AppEmitter();

// Prevent EventEmitter memory leak warnings for apps with many routes
appEmitter.setMaxListeners(30);
