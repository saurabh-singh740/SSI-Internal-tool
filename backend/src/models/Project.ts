import mongoose, { Document, Schema } from 'mongoose';

export type ProjectType = 'INTERNAL' | 'CLIENT_PROJECT' | 'SUPPORT';
export type ProjectStatus = 'ACTIVE' | 'CLOSED' | 'ON_HOLD';
export type ProjectPhase = 'PLANNING' | 'EXECUTION' | 'DELIVERY' | 'MAINTENANCE';
export type Currency = 'USD' | 'INR' | 'EUR';
export type BillingType = 'TIME_AND_MATERIAL' | 'FIXED_PRICE' | 'MILESTONE';
export type BillingCycle = 'MONTHLY' | 'QUARTERLY' | 'MILESTONE_BASED';
export type PaymentTerms = 'NET_30' | 'NET_45' | 'NET_60';
export type PaymentMode = 'BANK_TRANSFER' | 'WIRE_TRANSFER' | 'UPI';
export type EngineerRole = 'LEAD_ENGINEER' | 'ENGINEER' | 'REVIEWER';
export type CustomFieldType = 'TEXT' | 'NUMBER' | 'DROPDOWN' | 'DATE';

export interface IProjectEngineer {
  engineer: mongoose.Types.ObjectId;
  role: EngineerRole;
  allocationPercentage: number;
  startDate?: Date;
  endDate?: Date;
}

export interface ICustomField {
  name: string;
  type: CustomFieldType;
  value?: string;
  options?: string[]; // for DROPDOWN type
}

export interface IAttachment {
  filename: string;
  originalName: string;
  fileType: string;
  url: string;
  uploadedAt: Date;
}

export interface IProject extends Document {
  // Basic Info
  name: string;
  code: string;
  type: ProjectType;
  category?: string;
  status: ProjectStatus;
  description?: string;

  // Client Info
  clientName?: string;
  clientCompany?: string;
  clientEmail?: string;
  clientPhone?: string;

  // Timeline
  startDate?: Date;
  endDate?: Date;
  estimatedCompletionDate?: Date;
  phase: ProjectPhase;

  // Contract & Billing
  contractedHours: number;
  additionalApprovedHours: number;
  totalAuthorizedHours: number; // computed
  hourlyRate: number;
  currency: Currency;
  billingType: BillingType;
  billingCycle: BillingCycle;

  // Hours Monitoring
  maxAllowedHours: number;
  alertThreshold: number;
  isNearLimit: boolean;

  // Payment
  paymentTerms: PaymentTerms;
  tdsPercentage: number;
  paymentMode: PaymentMode;
  billingContactEmail?: string;

  // Client Access
  clientAccessEnabled: boolean;
  canViewSummary: boolean;
  canViewTimesheets: boolean;
  canViewPayments: boolean;
  canViewStatus: boolean;

  // Engineer Permissions
  engineersCanEditTimesheets: boolean;
  timesheetApprovalRequired: boolean;
  timesheetLockPeriod: 7 | 14 | 30;

  // Resources
  engineers: IProjectEngineer[];

  // Custom Fields
  customFields: ICustomField[];

  // Attachments
  attachments: IAttachment[];

  // Notes
  notes?: string;

  // Metrics (computed)
  hoursUsed: number;

  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectEngineerSchema = new Schema<IProjectEngineer>({
  engineer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['LEAD_ENGINEER', 'ENGINEER', 'REVIEWER'], default: 'ENGINEER' },
  allocationPercentage: { type: Number, default: 100, min: 0, max: 100 },
  startDate: { type: Date },
  endDate: { type: Date },
});

const CustomFieldSchema = new Schema<ICustomField>({
  name: { type: String, required: true },
  type: { type: String, enum: ['TEXT', 'NUMBER', 'DROPDOWN', 'DATE'], required: true },
  value: { type: String },
  options: [{ type: String }],
});

const AttachmentSchema = new Schema<IAttachment>({
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  fileType: { type: String, required: true },
  url: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now },
});

const ProjectSchema = new Schema<IProject>(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, trim: true },
    type: { type: String, enum: ['INTERNAL', 'CLIENT_PROJECT', 'SUPPORT'], required: true },
    category: { type: String },
    status: { type: String, enum: ['ACTIVE', 'CLOSED', 'ON_HOLD'], default: 'ACTIVE' },
    description: { type: String },

    clientName: { type: String },
    clientCompany: { type: String },
    clientEmail: { type: String },
    clientPhone: { type: String },

    startDate: { type: Date },
    endDate: { type: Date },
    estimatedCompletionDate: { type: Date },
    phase: {
      type: String,
      enum: ['PLANNING', 'EXECUTION', 'DELIVERY', 'MAINTENANCE'],
      default: 'PLANNING',
    },

    contractedHours: { type: Number, default: 0 },
    additionalApprovedHours: { type: Number, default: 0 },
    totalAuthorizedHours: { type: Number, default: 0 },
    hourlyRate: { type: Number, default: 0 },
    currency: { type: String, enum: ['USD', 'INR', 'EUR'], default: 'USD' },
    billingType: {
      type: String,
      enum: ['TIME_AND_MATERIAL', 'FIXED_PRICE', 'MILESTONE'],
      default: 'TIME_AND_MATERIAL',
    },
    billingCycle: {
      type: String,
      enum: ['MONTHLY', 'QUARTERLY', 'MILESTONE_BASED'],
      default: 'MONTHLY',
    },

    maxAllowedHours: { type: Number, default: 0 },
    alertThreshold: { type: Number, default: 80 },
    isNearLimit: { type: Boolean, default: false },

    paymentTerms: { type: String, enum: ['NET_30', 'NET_45', 'NET_60'], default: 'NET_30' },
    tdsPercentage: { type: Number, default: 0 },
    paymentMode: {
      type: String,
      enum: ['BANK_TRANSFER', 'WIRE_TRANSFER', 'UPI'],
      default: 'BANK_TRANSFER',
    },
    billingContactEmail: { type: String },

    clientAccessEnabled: { type: Boolean, default: false },
    canViewSummary: { type: Boolean, default: true },
    canViewTimesheets: { type: Boolean, default: false },
    canViewPayments: { type: Boolean, default: false },
    canViewStatus: { type: Boolean, default: true },

    engineersCanEditTimesheets: { type: Boolean, default: true },
    timesheetApprovalRequired: { type: Boolean, default: false },
    timesheetLockPeriod: { type: Number, enum: [7, 14, 30], default: 14 },

    engineers: [ProjectEngineerSchema],
    customFields: [CustomFieldSchema],
    attachments: [AttachmentSchema],
    notes: { type: String },

    hoursUsed: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// Auto-compute totalAuthorizedHours before save
ProjectSchema.pre('save', function (next) {
  this.totalAuthorizedHours = this.contractedHours + this.additionalApprovedHours;

  // Check near limit
  if (this.maxAllowedHours > 0) {
    const utilizationPct = (this.hoursUsed / this.maxAllowedHours) * 100;
    this.isNearLimit = utilizationPct >= this.alertThreshold;
  }

  // Validate engineer allocation <= 300%
  const totalAllocation = this.engineers.reduce((sum, e) => sum + e.allocationPercentage, 0);
  if (totalAllocation > 300) {
    return next(new Error('Total engineer allocation cannot exceed 300%'));
  }

  next();
});

// Virtual: remaining hours
ProjectSchema.virtual('remainingHours').get(function () {
  return this.totalAuthorizedHours - this.hoursUsed;
});

// Virtual: utilization percentage
ProjectSchema.virtual('utilizationPercentage').get(function () {
  if (this.totalAuthorizedHours === 0) return 0;
  return Math.round((this.hoursUsed / this.totalAuthorizedHours) * 100 * 100) / 100;
});

ProjectSchema.set('toJSON', { virtuals: true });
ProjectSchema.set('toObject', { virtuals: true });

// ── Performance indexes ───────────────────────────────────────────────────────
// status + createdAt: list page filters (active projects sorted by date)
ProjectSchema.index({ status: 1, createdAt: -1 });
// type filter
ProjectSchema.index({ type: 1 });
// engineer assignment lookups (used in getProjects ENGINEER filter + assign checks)
ProjectSchema.index({ 'engineers.engineer': 1 });
// created-by lookups (threshold notification + admin queries)
ProjectSchema.index({ createdBy: 1 });
// isNearLimit: scheduler + dashboard alert queries
ProjectSchema.index({ isNearLimit: 1, status: 1 });

export default mongoose.model<IProject>('Project', ProjectSchema);
