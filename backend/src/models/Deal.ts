import mongoose, { Document, Schema } from 'mongoose';
import { ICustomField } from './Project';

// ── Enums ─────────────────────────────────────────────────────────────────────

export type DealStage    = 'LEAD' | 'QUALIFIED' | 'PROPOSAL' | 'NEGOTIATION' | 'WON' | 'LOST';
export type DealPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type DealSource   = 'REFERRAL' | 'INBOUND' | 'OUTBOUND' | 'PARTNER' | 'EXISTING_CLIENT';
export type DealLostReason = 'PRICE' | 'COMPETITOR' | 'TIMELINE' | 'NO_BUDGET' | 'NO_RESPONSE' | 'OTHER';
export type DealBillingType = 'TIME_AND_MATERIAL' | 'FIXED_PRICE' | 'MILESTONE';
export type DealCurrency = 'USD' | 'INR' | 'EUR';

// ── Sub-document interfaces ───────────────────────────────────────────────────

export interface IDealContact {
  name:   string;
  email?: string;
  phone?: string;
  role?:  string;
}

export interface ISOWSection {
  title:   string;
  content: string;
  order:   number;
}

// Intentionally the same shape as IProjectEngineer so conversion is a direct copy.
export type ResourcePlanRole = 'LEAD_ENGINEER' | 'ENGINEER' | 'REVIEWER';

export interface IResourcePlanEntry {
  engineer:             mongoose.Types.ObjectId;
  role:                 ResourcePlanRole;
  allocationPercentage: number;
  startDate?:           Date;
  endDate?:             Date;
  totalAuthorizedHours?: number;
}

// ── Main interface ────────────────────────────────────────────────────────────

export interface IDeal extends Document {
  title:         string;
  dealNumber:    string;
  stage:         DealStage;
  priority:      DealPriority;

  clientCompany: string;
  clientDomain?: string;
  contacts:      IDealContact[];

  source?:    DealSource;
  referredBy?: string;

  estimatedValue:  number;
  currency:        DealCurrency;
  estimatedHours?: number;
  proposedRate?:   number;
  billingType?:    DealBillingType;

  expectedCloseDate?:  Date;
  proposedStartDate?:  Date;
  proposedEndDate?:    Date;

  sowSections:  ISOWSection[];
  sowFinalised: boolean;

  winProbability: number;

  lostReason?: DealLostReason;
  lostNote?:   string;

  owner: mongoose.Types.ObjectId;
  team:  mongoose.Types.ObjectId[];

  convertedProjectId?: mongoose.Types.ObjectId;
  convertedAt?:        Date;
  convertedBy?:        mongoose.Types.ObjectId;

  // Tentative resource plan (planning layer — no timesheets created here)
  resourcePlan: IResourcePlanEntry[];

  // Partner associated with this deal (ref: Partner collection)
  partnerId?: mongoose.Types.ObjectId;

  customFields: ICustomField[];
  tags:         string[];
  isArchived:   boolean;

  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ── Sub-document schemas ──────────────────────────────────────────────────────

const DealContactSchema = new Schema<IDealContact>(
  {
    name:  { type: String, required: true, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    role:  { type: String, trim: true },
  },
  { _id: false }
);

const SOWSectionSchema = new Schema<ISOWSection>(
  {
    title:   { type: String, required: true, trim: true },
    content: { type: String, default: '' },
    order:   { type: Number, default: 0 },
  },
  { _id: true }
);

// Same shape as Project.engineers — zero transformation needed on conversion
const ResourcePlanEntrySchema = new Schema<IResourcePlanEntry>(
  {
    engineer:             { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role:                 { type: String, enum: ['LEAD_ENGINEER', 'ENGINEER', 'REVIEWER'], default: 'ENGINEER' },
    allocationPercentage: { type: Number, default: 100, min: 0, max: 100 },
    startDate:            { type: Date },
    endDate:              { type: Date },
    totalAuthorizedHours: { type: Number, min: 0 },
  },
  { _id: false }
);

// Reuse the same CustomField shape from the Project model
const CustomFieldSchema = new Schema<ICustomField>(
  {
    name:    { type: String, required: true },
    type:    { type: String, enum: ['TEXT', 'NUMBER', 'DROPDOWN', 'DATE'], required: true },
    value:   { type: String },
    options: [{ type: String }],
  },
  { _id: false }
);

// ── Main schema ───────────────────────────────────────────────────────────────

const DealSchema = new Schema<IDeal>(
  {
    title:      { type: String, required: true, trim: true },
    dealNumber: { type: String, unique: true },

    stage:    { type: String, enum: ['LEAD','QUALIFIED','PROPOSAL','NEGOTIATION','WON','LOST'], default: 'LEAD' },
    priority: { type: String, enum: ['LOW','MEDIUM','HIGH','CRITICAL'], default: 'MEDIUM' },

    clientCompany: { type: String, required: true, trim: true },
    clientDomain:  { type: String, trim: true },
    contacts:      [DealContactSchema],

    source:    { type: String, enum: ['REFERRAL','INBOUND','OUTBOUND','PARTNER','EXISTING_CLIENT'] },
    referredBy: { type: String, trim: true },

    estimatedValue: { type: Number, default: 0, min: 0 },
    currency:       { type: String, enum: ['USD','INR','EUR'], default: 'USD' },
    estimatedHours: { type: Number, min: 0 },
    proposedRate:   { type: Number, min: 0 },
    billingType:    { type: String, enum: ['TIME_AND_MATERIAL','FIXED_PRICE','MILESTONE'] },

    expectedCloseDate:  { type: Date },
    proposedStartDate:  { type: Date },
    proposedEndDate:    { type: Date },

    sowSections:  [SOWSectionSchema],
    sowFinalised: { type: Boolean, default: false },

    winProbability: { type: Number, default: 10, min: 0, max: 100 },

    lostReason: { type: String, enum: ['PRICE','COMPETITOR','TIMELINE','NO_BUDGET','NO_RESPONSE','OTHER'] },
    lostNote:   { type: String },

    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    team:  [{ type: Schema.Types.ObjectId, ref: 'User' }],

    // Set when stage transitions to WON + admin converts to Project
    convertedProjectId: { type: Schema.Types.ObjectId, ref: 'Project' },
    convertedAt:        { type: Date },
    convertedBy:        { type: Schema.Types.ObjectId, ref: 'User' },

    resourcePlan: [ResourcePlanEntrySchema],

    partnerId: { type: Schema.Types.ObjectId, ref: 'Partner' },

    customFields: [CustomFieldSchema],
    tags:         [{ type: String, trim: true }],
    isArchived:   { type: Boolean, default: false },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// ── Pre-save: auto-generate dealNumber on first create ────────────────────────

DealSchema.pre('save', async function (next) {
  if (this.isNew && !this.dealNumber) {
    // Atomic $inc on a counters document — O(1) regardless of deal volume.
    // countDocuments() was O(n) and would degrade noticeably at 10k+ deals.
    const db      = mongoose.connection.db!;
    const counter = await db
      .collection<{ _id: string; seq: number }>('counters')
      .findOneAndUpdate(
        { _id: 'deal' },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after' }
      );
    const year = new Date().getFullYear();
    this.dealNumber = `DEAL-${year}-${String(counter!.seq).padStart(4, '0')}`;
  }
  next();
});

// ── Indexes ───────────────────────────────────────────────────────────────────

DealSchema.index({ stage: 1, createdAt: -1 });
DealSchema.index({ owner: 1, stage: 1 });
DealSchema.index({ isArchived: 1, stage: 1 });
DealSchema.index({ clientCompany: 1 });
DealSchema.index({ expectedCloseDate: 1 });
DealSchema.index({ convertedProjectId: 1 }, { sparse: true });
DealSchema.index({ partnerId: 1, stage: 1 });
DealSchema.index({ 'team': 1 });

export default mongoose.model<IDeal>('Deal', DealSchema);
