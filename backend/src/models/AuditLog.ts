/**
 * AuditLog — immutable, append-only record of every privileged mutation.
 *
 * Retention strategy (tiered by severity):
 *  • Each document gets an `expiresAt` field stamped at write time.
 *  • A TTL index on `expiresAt` (expireAfterSeconds: 0) handles automatic expiry.
 *  • Defaults (override via env vars):
 *      CRITICAL  → AUDIT_RETENTION_CRITICAL_DAYS  (default 1825 = 5 years)
 *      HIGH      → AUDIT_RETENTION_HIGH_DAYS       (default  730 = 2 years)
 *      MEDIUM    → AUDIT_RETENTION_MEDIUM_DAYS     (default  365 = 1 year)
 *      LOW       → AUDIT_RETENTION_LOW_DAYS        (default   90 days)
 *  • The auditRetentionScheduler runs weekly to clean legacy docs (no expiresAt)
 *    and enforce a hard cap (AUDIT_MAX_DOCS, default 500 000).
 *  • All writes go through auditLogger.ts — never call AuditLog.create() directly.
 *  • actorId is optional so failed-login events (unknown user) can be recorded.
 */
import mongoose, { Document, Schema } from 'mongoose';

// ── Enum types ────────────────────────────────────────────────────────────────

export type AuditModule =
  | 'AUTH'
  | 'USERS'
  | 'PROJECTS'
  | 'DEALS'
  | 'TIMESHEETS'
  | 'PAYMENTS'
  | 'PARTNERS'
  | 'FEEDBACK'
  | 'SYSTEM';

export type AuditSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

// ── Retention policy ──────────────────────────────────────────────────────────

function _retentionDays(envKey: string, fallback: number): number {
  const v = parseInt(process.env[envKey] ?? '', 10);
  return isNaN(v) || v < 1 ? fallback : v;
}

export const RETENTION_DAYS: Record<AuditSeverity, number> = {
  CRITICAL: _retentionDays('AUDIT_RETENTION_CRITICAL_DAYS', 5 * 365),
  HIGH:     _retentionDays('AUDIT_RETENTION_HIGH_DAYS',     2 * 365),
  MEDIUM:   _retentionDays('AUDIT_RETENTION_MEDIUM_DAYS',   365),
  LOW:      _retentionDays('AUDIT_RETENTION_LOW_DAYS',      90),
};

// ── Interface ─────────────────────────────────────────────────────────────────

export interface IAuditLog extends Document {
  // What happened
  action:       string;         // e.g. 'PROJECT_CREATED', 'USER_ROLE_CHANGED'
  module:       AuditModule;
  severity:     AuditSeverity;

  // Who did it
  actorId?:     mongoose.Types.ObjectId;
  actorName?:   string;
  actorEmail:   string;
  actorRole:    string;

  // What was affected
  entityId?:    string;
  entityLabel?: string;

  // What changed (only changed fields stored)
  oldValues?:   Record<string, unknown>;
  newValues?:   Record<string, unknown>;

  // Arbitrary extra context
  metadata?:    Record<string, unknown>;

  // Request context (captured by requestContext.middleware.ts)
  ipAddress?:   string;
  userAgent?:   string;
  requestId?:   string;

  // Tiered retention — stamped at write time; TTL index removes doc when now >= expiresAt
  expiresAt:    Date;

  createdAt:    Date;
}

// ── Schema ────────────────────────────────────────────────────────────────────

const AuditLogSchema = new Schema<IAuditLog>(
  {
    action:       { type: String, required: true },
    module:       {
      type:     String,
      required: true,
      enum:     ['AUTH','USERS','PROJECTS','DEALS','TIMESHEETS','PAYMENTS','PARTNERS','FEEDBACK','SYSTEM'],
    },
    severity: {
      type:    String,
      required: true,
      enum:    ['LOW','MEDIUM','HIGH','CRITICAL'],
      default: 'MEDIUM',
    },

    actorId:      { type: Schema.Types.ObjectId, ref: 'User' },   // optional: failed logins
    actorName:    { type: String },
    actorEmail:   { type: String, required: true, default: 'unknown' },
    actorRole:    { type: String, required: true, default: 'UNKNOWN' },

    entityId:     { type: String },
    entityLabel:  { type: String },

    oldValues:    { type: Schema.Types.Mixed },
    newValues:    { type: Schema.Types.Mixed },
    metadata:     { type: Schema.Types.Mixed },

    ipAddress:    { type: String },
    userAgent:    { type: String },
    requestId:    { type: String },

    expiresAt: { type: Date, required: true },
  },
  {
    // Append-only: only createdAt, no updatedAt
    timestamps: { createdAt: true, updatedAt: false },
    // Prevent accidental update operations from Mongoose middleware
    strict: true,
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────

// Cursor-based pagination primary index (admin viewer default sort)
AuditLogSchema.index({ createdAt: -1, _id: -1 });

// Module + time — most common filter combination in admin viewer
AuditLogSchema.index({ module: 1, createdAt: -1 });

// Severity filter + time — "show me all HIGH/CRITICAL events"
AuditLogSchema.index({ severity: 1, createdAt: -1 });

// Per-actor audit trail — "what did user X do?"
AuditLogSchema.index({ actorId:    1, createdAt: -1 });
AuditLogSchema.index({ actorEmail: 1, createdAt: -1 });

// Per-entity history — "what happened to project Y?"
AuditLogSchema.index({ entityId: 1, module: 1, createdAt: -1 });

// Action filter — "show all PROJECT_DELETED events"
AuditLogSchema.index({ action: 1, createdAt: -1 });

// Compound: module + severity — "HIGH events in PAYMENTS"
AuditLogSchema.index({ module: 1, severity: 1, createdAt: -1 });

// Per-document TTL — MongoDB removes doc when now >= expiresAt.
// expireAfterSeconds: 0 means "expire exactly at the stored date/time".
// Retention windows are stamped into expiresAt at write time (see auditLogger.ts).
// Legacy docs without expiresAt are handled by auditRetentionScheduler.ts.
AuditLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Retention admin queries — "show me docs expiring in the next 30 days"
AuditLogSchema.index({ severity: 1, expiresAt: 1 });

// ── Block mutations at the model level ────────────────────────────────────────
// These hooks make it impossible to accidentally call AuditLog.updateOne() etc.

AuditLogSchema.pre(['updateOne', 'findOneAndUpdate', 'updateMany'], function () {
  throw new Error('[AuditLog] Audit logs are immutable — update operations are not allowed');
});

export default mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
