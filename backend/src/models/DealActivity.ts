import mongoose, { Document, Schema } from 'mongoose';
import { DealStage } from './Deal';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActivityType =
  | 'STAGE_CHANGED'
  | 'NOTE_ADDED'
  | 'SOW_UPDATED'
  | 'CONTACT_ADDED'
  | 'VALUE_CHANGED'
  | 'CONVERTED'
  | 'FIELD_CHANGED';

export interface IActivityMeta {
  fromStage?:  DealStage;
  toStage?:    DealStage;
  fieldName?:  string;
  oldValue?:   unknown;
  newValue?:   unknown;
  note?:       string;
  projectId?:  mongoose.Types.ObjectId;
}

export interface IDealActivity extends Document {
  dealId: mongoose.Types.ObjectId;
  type:   ActivityType;
  actor:  mongoose.Types.ObjectId;
  meta:   IActivityMeta;
  createdAt: Date;
  updatedAt: Date;
}

// ── Schema ────────────────────────────────────────────────────────────────────

const DealActivitySchema = new Schema<IDealActivity>(
  {
    dealId: { type: Schema.Types.ObjectId, ref: 'Deal', required: true },
    type: {
      type: String,
      enum: ['STAGE_CHANGED','NOTE_ADDED','SOW_UPDATED','CONTACT_ADDED','VALUE_CHANGED','CONVERTED','FIELD_CHANGED'],
      required: true,
    },
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    meta: {
      fromStage:  { type: String },
      toStage:    { type: String },
      fieldName:  { type: String },
      oldValue:   { type: Schema.Types.Mixed },
      newValue:   { type: Schema.Types.Mixed },
      note:       { type: String },
      projectId:  { type: Schema.Types.ObjectId, ref: 'Project' },
    },
  },
  { timestamps: true }
);

// Append-only — always paginated by deal + date desc
DealActivitySchema.index({ dealId: 1, createdAt: -1 });

export default mongoose.model<IDealActivity>('DealActivity', DealActivitySchema);
