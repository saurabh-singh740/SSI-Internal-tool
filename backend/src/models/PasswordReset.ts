import mongoose, { Document, Schema } from 'mongoose';
import crypto from 'crypto';

export interface IPasswordReset extends Document {
  user:      mongoose.Types.ObjectId;
  tokenHash: string;   // SHA-256 hash of the raw token sent to the user
  expiresAt: Date;
}

const PasswordResetSchema = new Schema<IPasswordReset>({
  user:      { type: Schema.Types.ObjectId, ref: 'User', required: true },
  tokenHash: { type: String, required: true },
  expiresAt: { type: Date,   required: true },
});

// Auto-delete expired docs — MongoDB removes them ~60s after expiresAt
PasswordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** Hash a raw token before storing or comparing. */
export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export default mongoose.model<IPasswordReset>('PasswordReset', PasswordResetSchema);
