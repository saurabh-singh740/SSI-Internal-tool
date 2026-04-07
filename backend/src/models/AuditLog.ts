/**
 * AuditLog — immutable record of privileged mutations.
 *
 * Tracks: user role changes, user deletions, admin creations, payment mutations.
 * Documents are never updated or deleted (append-only by convention).
 * TTL index auto-removes records older than 2 years to control collection size.
 */
import mongoose, { Document, Schema } from 'mongoose';

export interface IAuditLog extends Document {
  action:      string;   // e.g. 'user.role_changed', 'user.deleted', 'payment.deleted'
  actorId:     mongoose.Types.ObjectId;
  actorEmail:  string;
  targetType:  string;   // 'user' | 'project' | 'payment'
  targetId:    string;
  targetLabel: string;   // human-readable (email, project code, invoice number)
  before?:     Record<string, unknown>;
  after?:      Record<string, unknown>;
  createdAt:   Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    action:      { type: String, required: true, index: true },
    actorId:     { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actorEmail:  { type: String, required: true },
    targetType:  { type: String, required: true },
    targetId:    { type: String, required: true },
    targetLabel: { type: String, required: true },
    before:      { type: Schema.Types.Mixed },
    after:       { type: Schema.Types.Mixed },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // append-only
  }
);

// Query patterns: actor audit trail + target history + recent actions
AuditLogSchema.index({ actorId: 1, createdAt: -1 });
AuditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
AuditLogSchema.index({ createdAt: -1 });

// TTL: auto-purge records older than 730 days (2 years)
AuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 730 * 24 * 60 * 60 });

export default mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
