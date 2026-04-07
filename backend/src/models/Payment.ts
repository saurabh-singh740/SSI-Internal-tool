import mongoose, { Document, Schema } from 'mongoose';

export type PaymentStatus = 'pending' | 'received' | 'overdue' | 'partial';

export interface IPayment extends Document {
  projectId:    mongoose.Types.ObjectId;
  invoiceNumber?: string;
  invoiceMonth: string;        // human label, e.g. "March 2025"
  billingPeriodStart?: Date;
  billingPeriodEnd?:   Date;
  paymentDate:  Date;          // due date (or actual payment date once received)
  grossAmount:  number;
  tdsAmount:    number;
  netAmount:    number;        // auto-computed: grossAmount - tdsAmount
  currency:     'USD' | 'INR' | 'EUR';
  paidToAccount?: string;
  referenceUTR?:  string;
  notes?:         string;
  status:       PaymentStatus;
  reminderSent3:  boolean;     // 3-day reminder fired
  reminderSent7:  boolean;     // 7-day reminder fired
  createdBy:    mongoose.Types.ObjectId;
  createdAt:    Date;
  updatedAt:    Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    invoiceNumber:      { type: String, trim: true },
    invoiceMonth:       { type: String, required: true, trim: true },
    billingPeriodStart: { type: Date },
    billingPeriodEnd:   { type: Date },
    paymentDate:        { type: Date, required: true, index: true },
    grossAmount:        { type: Number, required: true, min: 0 },
    tdsAmount:          { type: Number, default: 0,  min: 0 },
    netAmount:          { type: Number, default: 0 },
    currency: {
      type: String,
      enum: ['USD', 'INR', 'EUR'],
      default: 'USD',
    },
    paidToAccount: { type: String, trim: true },
    referenceUTR:  { type: String, trim: true },
    notes:         { type: String, trim: true },
    status: {
      type: String,
      enum: ['pending', 'received', 'overdue', 'partial'],
      default: 'pending',
      index: true,
    },
    reminderSent3: { type: Boolean, default: false },
    reminderSent7: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// Auto-compute netAmount before every save
PaymentSchema.pre('save', function (next) {
  this.netAmount = Math.round((this.grossAmount - this.tdsAmount) * 100) / 100;
  next();
});

// Compound index for per-project queries sorted by date
PaymentSchema.index({ projectId: 1, paymentDate: -1 });

// Compound index for scheduler overdue queries: status filter + date range scan
PaymentSchema.index({ status: 1, paymentDate: 1 });

export default mongoose.model<IPayment>('Payment', PaymentSchema);
