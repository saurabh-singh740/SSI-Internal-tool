import mongoose, { Document, Schema } from 'mongoose';

// ── Entry: one row = one calendar day ─────────────────────────────────────────
export interface ITimesheetEntry {
  _id?: mongoose.Types.ObjectId;
  sno: number;           // sequential row number within the month
  week: number;          // week-of-month: 1–5
  dayOfWeek: string;     // Monday … Sunday
  date: Date;
  projectWork: string;
  hours: number;         // whole hours entered by engineer
  minutes: number;       // additional minutes (0-59)
  totalHours: number;    // computed: hours + minutes / 60
  remarks: string;
}

// ── Month: 12 of these per Timesheet document ─────────────────────────────────
export interface IMonthSheet {
  _id?: mongoose.Types.ObjectId;
  monthIndex: number;   // 0 = January … 11 = December
  monthName: string;
  entries: ITimesheetEntry[];
  // computed aggregates (recalculated on every save)
  weeklyTotals: { week: number; total: number }[];
  monthlyTotal: number;
  // authorized-hours tracking (filled by controller from project data)
  authorizedHoursUsedUpToMonth: number;
  authorizedHoursRemainingAfterMonth: number;
  // admin lock
  isLocked: boolean;
  lockedAt?: Date;
  lockedBy?: mongoose.Types.ObjectId;
}

// ── Root document: one per (project, engineer, year) ─────────────────────────
export interface ITimesheet extends Document {
  project: mongoose.Types.ObjectId;
  engineer: mongoose.Types.ObjectId;
  year: number;
  months: IMonthSheet[];
  createdAt: Date;
  updatedAt: Date;
}

// ── Sub-schemas ───────────────────────────────────────────────────────────────
const EntrySchema = new Schema<ITimesheetEntry>(
  {
    sno: { type: Number, required: true },
    week: { type: Number, required: true },
    dayOfWeek: { type: String, required: true },
    date: { type: Date, required: true },
    projectWork: { type: String, default: '' },
    hours: { type: Number, default: 0, min: 0, max: 23 },
    minutes: { type: Number, default: 0, min: 0, max: 59 },
    totalHours: { type: Number, default: 0 },
    remarks: { type: String, default: '' },
  },
  { _id: true }
);

const MonthSchema = new Schema<IMonthSheet>(
  {
    monthIndex: { type: Number, required: true, min: 0, max: 11 },
    monthName: { type: String, required: true },
    entries: [EntrySchema],
    weeklyTotals: [
      {
        week: { type: Number },
        total: { type: Number, default: 0 },
      },
    ],
    monthlyTotal: { type: Number, default: 0 },
    authorizedHoursUsedUpToMonth: { type: Number, default: 0 },
    authorizedHoursRemainingAfterMonth: { type: Number, default: 0 },
    isLocked: { type: Boolean, default: false },
    lockedAt: { type: Date },
    lockedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: true }
);

const TimesheetSchema = new Schema<ITimesheet>(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    engineer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    year: { type: Number, required: true },
    months: [MonthSchema],
  },
  { timestamps: true }
);

// Primary lookup: one timesheet per (project, engineer, year)
TimesheetSchema.index({ project: 1, engineer: 1, year: 1 }, { unique: true });

// Batch engineer dashboard fetch: GET /timesheets/engineer/:engineerId/:year
// Without this, MongoDB would do a full collection scan filtered in-memory.
TimesheetSchema.index({ engineer: 1, year: 1 });

// Admin project overview: GET /timesheets/project/:projectId?year=...
TimesheetSchema.index({ project: 1, year: 1 });

export default mongoose.model<ITimesheet>('Timesheet', TimesheetSchema);
