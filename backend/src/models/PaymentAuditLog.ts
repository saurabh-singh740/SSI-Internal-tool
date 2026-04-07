import mongoose, { Document, Schema } from 'mongoose';

export type AuditAction = 'created' | 'updated' | 'deleted';

export interface IAuditChange {
  field:    string;
  oldValue: unknown;
  newValue: unknown;
}

export interface IPaymentAuditLog extends Document {
  paymentId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  action:    AuditAction;
  changedBy: mongoose.Types.ObjectId;
  changedAt: Date;
  changes:   IAuditChange[];
  snapshot:  Record<string, unknown>; // full payment state at the time of action
}

const AuditChangeSchema = new Schema<IAuditChange>(
  {
    field:    { type: String, required: true },
    oldValue: { type: Schema.Types.Mixed },
    newValue: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const PaymentAuditLogSchema = new Schema<IPaymentAuditLog>(
  {
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true, index: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    action:    { type: String, enum: ['created', 'updated', 'deleted'], required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    changedAt: { type: Date, default: Date.now },
    changes:   [AuditChangeSchema],
    snapshot:  { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: false }
);

PaymentAuditLogSchema.index({ paymentId: 1, changedAt: -1 });

export default mongoose.model<IPaymentAuditLog>('PaymentAuditLog', PaymentAuditLogSchema);
