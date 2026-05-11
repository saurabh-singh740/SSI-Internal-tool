/**
 * auditLogger — centralized, non-blocking audit log writer.
 *
 * USAGE:
 *   auditLogger({
 *     req,                          // auto-extracts actor, IP, UA, requestId
 *     action:  'PROJECT_CREATED',
 *     module:  'PROJECTS',
 *     entityId:    String(project._id),
 *     entityLabel: project.name,
 *     newValues:   { name, code, type },
 *   });
 *
 * GUARANTEES:
 *   • Fire-and-forget — never awaited, never throws to the caller.
 *   • A failed audit write NEVER rejects or delays the HTTP response.
 *   • When Redis is available → job queued in BullMQ (durable, retried).
 *   • When Redis is absent  → direct async MongoDB write (best-effort).
 *   • Sensitive fields (password, token, secret…) are sanitized automatically.
 *
 * BACKWARD COMPAT:
 *   The old auditLog() function signature is preserved as a thin wrapper
 *   so existing calls in user.controller.ts continue to work unchanged.
 */

import mongoose             from 'mongoose';
import { AuthRequest }      from '../middleware/auth.middleware';
import AuditLog, {
  AuditModule,
  AuditSeverity,
}                           from '../models/AuditLog';
import { getAuditQueue }    from '../queues/auditQueue';
import { sanitize }         from './diffUtil';

// ── Default severity per action ───────────────────────────────────────────────
// Callers can override via entry.severity.

const ACTION_SEVERITY: Record<string, AuditSeverity> = {
  // Critical — system-altering or irreversible
  AUTH_ADMIN_REGISTERED:    'CRITICAL',
  DEAL_CONVERTED:           'CRITICAL',

  // High — deletions, role changes, security events
  USER_DELETED:             'HIGH',
  USER_ROLE_CHANGED:        'HIGH',
  PROJECT_DELETED:          'HIGH',
  DEAL_DELETED:             'HIGH',
  PAYMENT_DELETED:          'HIGH',
  AUTH_LOGIN_FAILED:        'HIGH',
  TIMESHEET_MONTH_LOCKED:   'HIGH',
  TIMESHEET_MONTH_UNLOCKED: 'HIGH',

  // Medium — standard creates / updates
  PROJECT_CREATED:          'MEDIUM',
  PROJECT_UPDATED:          'MEDIUM',
  ENGINEER_ADDED:           'MEDIUM',
  ENGINEER_REMOVED:         'MEDIUM',
  DEAL_CREATED:             'MEDIUM',
  DEAL_UPDATED:             'MEDIUM',
  DEAL_STAGE_CHANGED:       'MEDIUM',
  DEAL_SOW_UPDATED:         'MEDIUM',
  PAYMENT_CREATED:          'MEDIUM',
  PAYMENT_UPDATED:          'MEDIUM',
  USER_CREATED:             'MEDIUM',
  USER_UPDATED:             'MEDIUM',
  PARTNER_CREATED:          'MEDIUM',
  PARTNER_UPDATED:          'MEDIUM',
  PARTNER_DELETED:          'MEDIUM',

  // Low — non-sensitive read-adjacent events
  AUTH_LOGIN:                    'LOW',
  AUTH_LOGOUT:                   'LOW',
  TIMESHEET_ENTRY_UPDATED:       'LOW',
  ATTACHMENT_UPLOADED:           'LOW',
  DEAL_RESOURCE_PLAN_UPDATED:    'MEDIUM',
  ATTACHMENT_DELETED:            'HIGH',
};

// ── Entry interface ───────────────────────────────────────────────────────────

/** Extended request type that includes the request-context middleware fields. */
type RequestWithContext = AuthRequest & {
  requestId?: string;
  clientIp?:  string;
};

export interface AuditEntry {
  /** Pass the Express request to auto-extract actor, IP, UA, requestId. */
  req?:          RequestWithContext;

  /** Required: what action occurred (SCREAMING_SNAKE_CASE by convention). */
  action:        string;

  /** Required: which domain/module this action belongs to. */
  module:        AuditModule;

  /** ID of the affected entity (project._id, deal._id, etc.). */
  entityId?:     string;

  /** Human-readable entity label (project.name, user.email, etc.). */
  entityLabel?:  string;

  /** Override the default severity inferred from `action`. */
  severity?:     AuditSeverity;

  /** Snapshot of fields BEFORE the mutation (only changed fields). */
  oldValues?:    Record<string, unknown>;

  /** Snapshot of fields AFTER the mutation (only changed fields). */
  newValues?:    Record<string, unknown>;

  /** Arbitrary contextual data (e.g. { reason, dealTitle }). */
  metadata?:     Record<string, unknown>;

  // ── Override auto-extracted request context ──────────────────────────────
  // Use these when req is not available (e.g. background workers, schedulers).
  actorId?:      string;
  actorName?:    string;
  actorEmail?:   string;
  actorRole?:    string;
  ipAddress?:    string;
  userAgent?:    string;
  requestId?:    string;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * auditLogger — fire-and-forget.  Call it and move on; the HTTP response
 * is NOT blocked by the audit write under any circumstances.
 */
export function auditLogger(entry: AuditEntry): void {
  // Extract actor from req.user (set by protect() middleware)
  const actorId    = entry.actorId    ?? entry.req?.user?.id;
  const actorName  = entry.actorName  ?? entry.req?.user?.name;
  const actorEmail = entry.actorEmail ?? entry.req?.user?.email ?? 'system';
  const actorRole  = entry.actorRole  ?? entry.req?.user?.role  ?? 'UNKNOWN';

  // Extract request context (set by requestContextMiddleware)
  const ipAddress  = entry.ipAddress  ?? entry.req?.clientIp  ?? 'unknown';
  const userAgent  = entry.userAgent  ?? entry.req?.headers?.['user-agent'] ?? '';
  const requestId  = entry.requestId  ?? entry.req?.requestId  ?? '';

  // Resolve severity (action-based default → caller override)
  const severity = entry.severity ?? ACTION_SEVERITY[entry.action] ?? 'MEDIUM';

  // Sanitize — strip passwords, tokens, secrets before they reach the DB
  const oldValues = entry.oldValues
    ? (sanitize(entry.oldValues) as Record<string, unknown>)
    : undefined;
  const newValues = entry.newValues
    ? (sanitize(entry.newValues) as Record<string, unknown>)
    : undefined;

  const payload = {
    action:      entry.action,
    module:      entry.module,
    severity,
    actorId,                          // string — re-hydrated to ObjectId in worker
    actorName,
    actorEmail,
    actorRole,
    entityId:    entry.entityId,
    entityLabel: entry.entityLabel,
    oldValues,
    newValues,
    metadata:    entry.metadata,
    ipAddress,
    userAgent:   userAgent.slice(0, 512), // cap to prevent oversized documents
    requestId,
  };

  // Always log to console first — visible in Render/any log aggregator
  // regardless of queue or DB health.
  console.log(
    `[AUDIT] ${entry.action} | ${actorEmail}(${actorRole})` +
    ` | ${entry.module}${entry.entityId ? ':' + entry.entityId : ''}` +
    ` | sev:${severity} | reqId:${requestId || '-'}`,
  );

  // ── Route to queue or direct DB write ────────────────────────────────────
  const queue = getAuditQueue();

  if (queue) {
    // Priority: CRITICAL=1 (processed first), everything else=10
    const priority = severity === 'CRITICAL' ? 1 : severity === 'HIGH' ? 3 : 10;

    queue
      .add('audit.write', payload, { priority })
      .catch((err: Error) => {
        // Queue push failed (Redis unavailable) — fall back to direct write
        console.error('[Audit] Queue push failed — direct write fallback:', err.message);
        _writeDirect(payload);
      });
    return;
  }

  // Redis not configured — write directly (best-effort, non-blocking)
  _writeDirect(payload);
}

/** Direct, fire-and-forget MongoDB write used when BullMQ is unavailable. */
function _writeDirect(payload: Record<string, unknown>): void {
  const { actorId, ...rest } = payload as { actorId?: string } & Record<string, unknown>;
  AuditLog.create({
    ...rest,
    actorId: actorId ? new mongoose.Types.ObjectId(actorId) : undefined,
  }).catch((err: Error) => {
    // Never propagate — audit failures must never affect business operations
    console.error('[Audit] Direct DB write failed (operation NOT affected):', err.message);
  });
}

// ── Backward-compat shim ──────────────────────────────────────────────────────
// Preserves the old auditLog() signature used in user.controller.ts so existing
// calls compile without modification.  Internally delegates to auditLogger().

/** @deprecated Use auditLogger() directly. */
export interface LegacyAuditEntry {
  action:      string;
  actorId:     string;
  actorEmail:  string;
  targetType:  string;
  targetId:    string;
  targetLabel: string;
  before?:     Record<string, unknown>;
  after?:      Record<string, unknown>;
}

/** @deprecated Use auditLogger() directly. */
export function auditLog(entry: LegacyAuditEntry): void {
  auditLogger({
    action:      entry.action.toUpperCase().replace(/\./g, '_'),
    module:      (entry.targetType.toUpperCase()) as AuditModule,
    entityId:    entry.targetId,
    entityLabel: entry.targetLabel,
    actorId:     entry.actorId,
    actorEmail:  entry.actorEmail,
    oldValues:   entry.before,
    newValues:   entry.after,
  });
}
