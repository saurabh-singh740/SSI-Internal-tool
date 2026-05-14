import mongoose, { Document, Schema } from 'mongoose';

export type FeedbackStatus    = 'PENDING' | 'SUBMITTED' | 'REVIEWED' | 'RESOLVED';
export type FeedbackSentiment = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';

export interface IFeedbackRatings {
  communication:   number;
  delivery:        number;
  quality:         number;
  support:         number;
  professionalism: number;
  overall:         number;
}

export interface IFeedback extends Document {
  feedbackNumber:   string;
  project:          mongoose.Types.ObjectId;
  engineer?:        mongoose.Types.ObjectId;

  submittedBy:      mongoose.Types.ObjectId;
  submitterName:    string;
  submitterEmail:   string;
  isAnonymous:      boolean;

  period:           string;
  status:           FeedbackStatus;
  sentiment:        FeedbackSentiment;

  ratings:          IFeedbackRatings;
  comment?:         string;
  suggestion?:      string;
  tags:             string[];

  reviewedBy?:      mongoose.Types.ObjectId;
  reviewNote?:      string;
  resolvedAt?:      Date;
  followUpRequired: boolean;

  createdAt:        Date;
  updatedAt:        Date;
}

const RatingsSchema = new Schema<IFeedbackRatings>(
  {
    communication:   { type: Number, required: true, min: 1, max: 5 },
    delivery:        { type: Number, required: true, min: 1, max: 5 },
    quality:         { type: Number, required: true, min: 1, max: 5 },
    support:         { type: Number, required: true, min: 1, max: 5 },
    professionalism: { type: Number, required: true, min: 1, max: 5 },
    overall:         { type: Number, required: true, min: 1, max: 5 },
  },
  { _id: false }
);

const FeedbackSchema = new Schema<IFeedback>(
  {
    feedbackNumber: { type: String, unique: true },

    project:  { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    engineer: { type: Schema.Types.ObjectId, ref: 'User' },

    submittedBy:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
    submitterName:  { type: String, required: true, trim: true },
    submitterEmail: { type: String, required: true, trim: true },
    isAnonymous:    { type: Boolean, default: false },

    period: { type: String, required: true, trim: true },
    status: {
      type:    String,
      enum:    ['PENDING', 'SUBMITTED', 'REVIEWED', 'RESOLVED'],
      default: 'SUBMITTED',
    },
    sentiment: {
      type:    String,
      enum:    ['POSITIVE', 'NEUTRAL', 'NEGATIVE'],
      default: 'NEUTRAL',
    },

    ratings:    { type: RatingsSchema, required: true },
    comment:    { type: String, trim: true },
    suggestion: { type: String, trim: true },
    tags:       [{ type: String, trim: true }],

    reviewedBy:      { type: Schema.Types.ObjectId, ref: 'User' },
    reviewNote:      { type: String, trim: true },
    resolvedAt:      { type: Date },
    followUpRequired:{ type: Boolean, default: false },
  },
  { timestamps: true }
);

// Auto-generate feedbackNumber + compute sentiment on every save
FeedbackSchema.pre('save', async function (next) {
  if (this.isNew && !this.feedbackNumber) {
    const db      = mongoose.connection.db!;
    const counter = await db
      .collection<{ _id: string; seq: number }>('counters')
      .findOneAndUpdate(
        { _id: 'feedback' },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after' }
      );
    const year = new Date().getFullYear();
    this.feedbackNumber = `FB-${year}-${String(counter!.seq).padStart(4, '0')}`;
  }

  if (this.isModified('ratings')) {
    const o = this.ratings.overall;
    this.sentiment = o >= 4 ? 'POSITIVE' : o === 3 ? 'NEUTRAL' : 'NEGATIVE';
  }

  next();
});

// Prevent duplicate submissions for the same user+project+period
FeedbackSchema.index({ submittedBy: 1, project: 1, period: 1 }, { unique: true });

// Query pattern indexes
FeedbackSchema.index({ project: 1, createdAt: -1 });
FeedbackSchema.index({ engineer: 1, createdAt: -1 }, { sparse: true });
FeedbackSchema.index({ submittedBy: 1, createdAt: -1 });
FeedbackSchema.index({ status: 1, createdAt: -1 });
FeedbackSchema.index({ sentiment: 1, createdAt: -1 });
FeedbackSchema.index({ followUpRequired: 1, status: 1 });
FeedbackSchema.index({ createdAt: -1, _id: -1 }); // cursor pagination

export default mongoose.model<IFeedback>('Feedback', FeedbackSchema);
