import mongoose, { Document, Schema } from 'mongoose';

export type NotificationType =
  | 'TIMESHEET_SUBMITTED'
  | 'HOURS_THRESHOLD_EXCEEDED'
  | 'PAYMENT_RECORDED'
  | 'ENGINEER_ASSIGNED'
  | 'PROJECT_CLOSED';

export interface INotification extends Document {
  user: mongoose.Types.ObjectId;
  project?: mongoose.Types.ObjectId;
  type: NotificationType;
  message: string;
  read: boolean;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project' },
    type: {
      type: String,
      enum: [
        'TIMESHEET_SUBMITTED',
        'HOURS_THRESHOLD_EXCEEDED',
        'PAYMENT_RECORDED',
        'ENGINEER_ASSIGNED',
        'PROJECT_CLOSED',
      ],
      required: true,
    },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Query pattern: { user, read } for unread count + list
NotificationSchema.index({ user: 1, read: 1, createdAt: -1 });

export default mongoose.model<INotification>('Notification', NotificationSchema);
