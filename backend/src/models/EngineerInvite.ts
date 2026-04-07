import mongoose, { Document, Schema } from 'mongoose';

export interface IEngineerInvite extends Document {
  project: mongoose.Types.ObjectId;
  engineer: mongoose.Types.ObjectId;
  engineerEmail: string;
  token: string;
  expiresAt: Date;
  accepted: boolean;
  emailSent: boolean;
  emailSentAt?: Date;
  emailError?: string;
  createdAt: Date;
}

const EngineerInviteSchema = new Schema<IEngineerInvite>(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    engineer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    engineerEmail: { type: String, required: true, lowercase: true },
    token: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    accepted: { type: Boolean, default: false },
    emailSent: { type: Boolean, default: false },
    emailSentAt: { type: Date },
    emailError: { type: String },
  },
  { timestamps: true }
);

// token unique index is already created by `unique: true` on the field above.

// TTL index – mongo auto-deletes accepted/expired invites after 30 days
EngineerInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Used by assignEngineer cleanup: deleteMany({ project, engineer, accepted:false })
// Without this index, deleteMany scans the entire invites collection.
EngineerInviteSchema.index({ project: 1, engineer: 1, accepted: 1 });

export default mongoose.model<IEngineerInvite>('EngineerInvite', EngineerInviteSchema);
