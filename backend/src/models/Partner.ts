import mongoose, { Document, Schema } from 'mongoose';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PartnerType = 'INTERNAL' | 'RESELLER' | 'REFERRAL' | 'TECHNOLOGY' | 'IMPLEMENTATION';

export interface IPartner extends Document {
  name:         string;
  type:         PartnerType;

  // Contact info
  contactName?:  string;
  contactEmail?: string;
  contactPhone?: string;
  website?:      string;

  // Business
  country?:      string;
  notes?:        string;

  // SSI itself is seeded as the INTERNAL default partner.
  // Only one document can have isDefault: true.
  isDefault:     boolean;
  isActive:      boolean;

  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ── Schema ────────────────────────────────────────────────────────────────────

const PartnerSchema = new Schema<IPartner>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    type: {
      type:    String,
      enum:    ['INTERNAL', 'RESELLER', 'REFERRAL', 'TECHNOLOGY', 'IMPLEMENTATION'],
      default: 'RESELLER',
    },

    contactName:  { type: String, trim: true },
    contactEmail: { type: String, trim: true, lowercase: true },
    contactPhone: { type: String, trim: true },
    website:      { type: String, trim: true },
    country:      { type: String, trim: true },
    notes:        { type: String },

    isDefault: { type: Boolean, default: false },
    isActive:  { type: Boolean, default: true  },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

PartnerSchema.index({ isActive: 1, name: 1 });
// Enforce single default partner at the DB level
PartnerSchema.index({ isDefault: 1 }, { sparse: true });

export default mongoose.model<IPartner>('Partner', PartnerSchema);
