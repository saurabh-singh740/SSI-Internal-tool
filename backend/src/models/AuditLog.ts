/**
 * AuditLog — immutable, append-only record of every privileged mutation.
 *
 * Design:
 *  • updatedAt is intentionally omitted — logs are never mutated.
 *  • TTL index auto-purges records older than 2 years (730 days).
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
  | 'SYSTEM';

export type AuditSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

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

  createdAt:    Date;
}

// ── Schema ────────────────────────────────────────────────────────────────────

const AuditLogSchema = new Schema<IAuditLog>(
  {
    action:       { type: String, required: true },
    module:       {
      type:     String,
      required: true,
      enum:     ['AUTH','USERS','PROJECTS','DEALS','TIMESHEETS','PAYMENTS','PARTNERS','SYSTEM'],
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

// TTL: auto-purge records older than 730 days (2 years)
// ⚠  To increase retention: change expireAfterSeconds here + run collMod in MongoDB
AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 730 * 24 * 60 * 60 });

// ── Block mutations at the model level ────────────────────────────────────────
// These hooks make it impossible to accidentally call AuditLog.updateOne() etc.

AuditLogSchema.pre(['updateOne', 'findOneAndUpdate', 'updateMany'], function () {
  throw new Error('[AuditLog] Audit logs are immutable — update operations are not allowed');
});

export default mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
