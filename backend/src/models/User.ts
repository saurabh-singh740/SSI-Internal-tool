import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export type UserRole = 'ADMIN' | 'ENGINEER' | 'CUSTOMER';

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  phone?: string;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    role: { type: String, enum: ['ADMIN', 'ENGINEER', 'CUSTOMER'], default: 'ENGINEER' },
    phone: { type: String },
  },
  { timestamps: true }
);

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

UserSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

// Don't return password in JSON
UserSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: any, ret: any) => {
    ret.password = undefined;
    return ret;
  },
});

// ── Indexes ───────────────────────────────────────────────────────────────────
// email unique index is already created by `unique: true` on the field above.
// role: 1 — used by:
//   • countDocuments({ role: 'ADMIN' }) in bootstrap guard + deletion guard
//   • find({ role: { $in: ['ENGINEER','ADMIN'] } }) in getEngineers
UserSchema.index({ role: 1 });

export default mongoose.model<IUser>('User', UserSchema);
