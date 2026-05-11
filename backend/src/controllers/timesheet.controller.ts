import { Response } from 'express';
import mongoose from 'mongoose';
import Timesheet from '../models/Timesheet';
import Project from '../models/Project';
import Notification from '../models/Notification';
import { AuthRequest } from '../middleware/auth.middleware';
import { generateYearSheets, recalculateMonthTotals, recalculateAuthorizedHours } from '../utils/timesheetGenerator';
import { getWorkingDaysBetween } from '../shared/timesheetEngine';
import { safeError } from '../utils/apiError';
import { auditLogger } from '../utils/auditLogger';

function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/timesheets/:projectId/:engineerId/:year
// Returns METADATA only (month list with totals + lock status, NO entries).
// The full entries for each month are fetched on demand via getMonthSheet.
//
// Payload before: ~200KB (12 months × 31 entries × 8 fields)
// Payload after:  ~2KB   (12 month summaries, no entries)
// ─────────────────────────────────────────────────────────────────────────────
export const getOrGenerateTimesheet = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId, engineerId, year: yearStr } = req.params;
    const year = parseInt(yearStr, 10);

    if (isNaN(year) || year < 2000 || year > 2100) {
      res.status(400).json({ message: 'Invalid year' }); return;
    }
    if (!isValidObjectId(projectId) || !isValidObjectId(engineerId)) {
      res.status(400).json({ message: 'Invalid projectId or engineerId' }); return;
    }

    const project = await Project.findById(projectId)
      .select('contractedHours additionalApprovedHours canViewTimesheets engineersCanEditTimesheets startDate endDate')
      .lean();
    if (!project) { res.status(404).json({ message: 'Project not found' }); return; }

    if (req.user?.role === 'ENGINEER' && req.user.id !== engineerId) {
      res.status(403).json({ message: 'Access denied' }); return;
    }
    if (req.user?.role === 'CUSTOMER' && !project.canViewTimesheets) {
      res.status(403).json({ message: 'Timesheet access not enabled for this project' }); return;
    }

    let timesheet = await Timesheet.findOne({ project: projectId, engineer: engineerId, year })
      .select('project engineer year months.monthIndex months.monthName months.monthlyTotal months.isLocked months.weeklyTotals months.authorizedHoursUsedUpToMonth months.authorizedHoursRemainingAfterMonth months.lockedAt months.lockedBy')
      .lean();

    if (!timesheet) {
      const totalAuthorizedHours = (project as any).contractedHours + (project as any).additionalApprovedHours;
      const months = generateYearSheets(year, totalAuthorizedHours);
      const created = await Timesheet.create({ project: projectId, engineer: engineerId, year, months });
      // Return metadata only from newly created doc
      timesheet = await Timesheet.findById(created._id)
        .select('project engineer year months.monthIndex months.monthName months.monthlyTotal months.isLocked months.weeklyTotals months.authorizedHoursUsedUpToMonth months.authorizedHoursRemainingAfterMonth months.lockedAt months.lockedBy')
        .lean();
    }

    res.json({ timesheet });
  } catch (err: unknown) {
    console.error('[Timesheet] getOrGenerate error:', err);
    res.status(500).json({ message: 'Server error', ...safeError(err) });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/timesheets/:projectId/:engineerId/:year/:monthIndex
// Returns a SINGLE month with full entries. Called lazily when user opens a tab.
//
// Uses MongoDB $elemMatch projection — only the matching month subdocument
// is transmitted over the wire. MongoDB does NOT load other months into memory.
// ─────────────────────────────────────────────────────────────────────────────
export const getMonthSheet = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId, engineerId, year: yearStr, monthIndex: monthStr } = req.params;
    const year       = parseInt(yearStr, 10);
    const monthIndex = parseInt(monthStr, 10);

    if (isNaN(year)       || year < 2000 || year > 2100)  { res.status(400).json({ message: 'Invalid year' }); return; }
    if (isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) { res.status(400).json({ message: 'monthIndex must be 0–11' }); return; }
    if (!isValidObjectId(projectId) || !isValidObjectId(engineerId)) {
      res.status(400).json({ message: 'Invalid projectId or engineerId' }); return;
    }

    if (req.user?.role === 'ENGINEER' && req.user.id !== engineerId) {
      res.status(403).json({ message: 'Access denied' }); return;
    }

    // $elemMatch projection: MongoDB returns only the matching month subdoc.
    // This is far more efficient than loading the full document and slicing in JS.
    const timesheet = await Timesheet.findOne(
      { project: projectId, engineer: engineerId, year },
      { months: { $elemMatch: { monthIndex } } }
    ).lean();

    if (!timesheet) { res.status(404).json({ message: 'Timesheet not found' }); return; }

    const month = (timesheet.months as any[])?.[0] ?? null;
    if (!month)    { res.status(404).json({ message: `Month ${monthIndex} not found in timesheet` }); return; }

    res.json({ month });
  } catch (err: unknown) {
    console.error('[Timesheet] getMonthSheet error:', err);
    res.status(500).json({ message: 'Server error', ...safeError(err) });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/timesheets/engineer/:engineerId/:year
// Batch endpoint — returns all project timesheets for an engineer in one query.
// Replaces N+1 pattern in EngineerDashboard and WorkSummary.
// ─────────────────────────────────────────────────────────────────────────────
export const getEngineerTimesheets = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { engineerId, year: yearStr } = req.params;
    const year = parseInt(yearStr, 10);

    if (isNaN(year) || year < 2000 || year > 2100) {
      res.status(400).json({ message: 'Invalid year' }); return;
    }
    if (!isValidObjectId(engineerId)) {
      res.status(400).json({ message: 'Invalid engineerId' }); return;
    }

    // Engineers can only fetch their own; admins can fetch anyone
    if (req.user?.role === 'ENGINEER' && req.user.id !== engineerId) {
      res.status(403).json({ message: 'Access denied' }); return;
    }

    const timesheets = await Timesheet.find({ engineer: engineerId, year })
      .populate('project', 'name code clientName totalAuthorizedHours hoursUsed status engineers')
      .select('project year months.monthIndex months.monthName months.monthlyTotal months.isLocked months.weeklyTotals months.authorizedHoursRemainingAfterMonth');

    res.json({ timesheets });
  } catch (err: unknown) {
    console.error('[Timesheet] getEngineerTimesheets error:', err);
    res.status(500).json({ message: 'Server error', ...safeError(err) });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/timesheets/:projectId/:engineerId/:year/:monthIndex/entries/:entryId
// ─────────────────────────────────────────────────────────────────────────────
export const updateEntry = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId, engineerId, year: yearStr, monthIndex: monthStr, entryId } = req.params;
    const year       = parseInt(yearStr,  10);
    const monthIndex = parseInt(monthStr, 10);

    if (!isValidObjectId(projectId) || !isValidObjectId(engineerId)) {
      res.status(400).json({ message: 'Invalid projectId or engineerId' }); return;
    }
    if (isNaN(year) || year < 2000 || year > 2100) {
      res.status(400).json({ message: 'Invalid year' }); return;
    }
    if (isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) {
      res.status(400).json({ message: 'monthIndex must be between 0 and 11' }); return;
    }

    if (req.user?.role === 'ENGINEER' && req.user.id !== engineerId) {
      res.status(403).json({ message: 'Access denied' }); return;
    }
    if (req.user?.role === 'CUSTOMER') {
      res.status(403).json({ message: 'Customers cannot edit timesheets' }); return;
    }

    const timesheet = await Timesheet.findOne({ project: projectId, engineer: engineerId, year });
    if (!timesheet) { res.status(404).json({ message: 'Timesheet not found' }); return; }

    const month = timesheet.months.find(m => m.monthIndex === monthIndex);
    if (!month) { res.status(404).json({ message: 'Month not found' }); return; }

    if (month.isLocked) {
      res.status(400).json({ message: 'This month is locked and cannot be edited' }); return;
    }

    const project = await Project.findById(projectId);
    if (project && !project.engineersCanEditTimesheets && req.user?.role === 'ENGINEER') {
      res.status(403).json({ message: 'Timesheet editing is disabled for this project' }); return;
    }

    const entry = month.entries.find((e: any) => String(e._id) === entryId);
    if (!entry) { res.status(404).json({ message: 'Entry not found' }); return; }

    // ── Scheduling rules — mirror pre-sales allocation logic ─────────────────
    // Pre-sales uses: workingDays × 8h × (allocationPct/100) to plan hours.
    // Actual timesheets must obey the same constraints so execution matches plan.

    const { projectWork, hours, minutes, remarks } = req.body;

    // Resolve the hours/minutes being requested (default to current entry values
    // so text-only updates — projectWork, remarks — skip the numeric checks).
    const requestedHours   = hours   !== undefined ? Math.max(0, Number(hours))   : entry.hours;
    const requestedMinutes = minutes !== undefined ? Math.max(0, Math.min(59, Number(minutes))) : entry.minutes;
    const requestedTotal   = Math.round((requestedHours + requestedMinutes / 60) * 100) / 100;

    const entryDate = new Date(entry.date as any);
    const entryDay  = entryDate.toISOString().slice(0, 10);
    const dow       = entryDate.getUTCDay(); // 0 = Sunday, 6 = Saturday

    // 1. Block weekends — identical exclusion to getWorkingDaysBetween in timesheetEngine
    if (requestedTotal > 0 && (dow === 0 || dow === 6)) {
      res.status(400).json({
        message: 'Weekend entries are not allowed. Timesheets track working days only (Mon–Fri).',
      }); return;
    }

    if (project) {
      // 2. Resolve this engineer's project assignment.
      //    Engineer-specific dates take precedence over project-level dates;
      //    fall back to project dates when no per-engineer dates are set.
      const assignment     = project.engineers.find(e => String(e.engineer) === engineerId);
      const allocationPct  = assignment?.allocationPercentage ?? 100;
      const effectiveStart = assignment?.startDate ?? project.startDate;
      const effectiveEnd   = assignment?.endDate   ?? project.endDate;

      // 3. Enforce date boundaries (UTC string comparison — timezone-safe)
      if (effectiveStart) {
        const startDay = new Date(effectiveStart).toISOString().slice(0, 10);
        if (entryDay < startDay) {
          res.status(400).json({
            message: `This date (${entryDay}) is before the assignment start date (${startDay}).`,
          }); return;
        }
      }
      if (effectiveEnd) {
        const endDay = new Date(effectiveEnd).toISOString().slice(0, 10);
        if (entryDay > endDay) {
          res.status(400).json({
            message: `This date (${entryDay}) is after the assignment end date (${endDay}).`,
          }); return;
        }
      }

      // 4. Enforce daily hours cap: 8h × allocationPercentage
      //    Matches the per-day formula used in timesheetEngine.buildProjection().
      const maxDailyHours = (8 * allocationPct) / 100;
      if (requestedTotal > maxDailyHours + 1e-9) {
        res.status(400).json({
          message: `Max ${maxDailyHours.toFixed(1)}h/day at ${allocationPct}% allocation. You requested ${requestedTotal.toFixed(2)}h.`,
        }); return;
      }

      // 5. Prevent overfilling beyond the planned allocation budget.
      //    Budget = getWorkingDaysBetween(start, end) × 8h × allocationPct — the
      //    same formula that pre-sales uses to derive totalExpectedHours.
      if (effectiveStart && effectiveEnd && requestedTotal !== (entry.totalHours ?? 0)) {
        const budget = getWorkingDaysBetween(
          new Date(effectiveStart),
          new Date(effectiveEnd),
        ) * 8 * (allocationPct / 100);

        if (budget > 0) {
          const currentSheetTotal = timesheet.months.reduce((s, m) => s + m.monthlyTotal, 0);
          const prospectiveTotal  = currentSheetTotal - (entry.totalHours ?? 0) + requestedTotal;

          if (prospectiveTotal > budget + 1e-9) {
            const remaining = Math.max(0, budget - currentSheetTotal + (entry.totalHours ?? 0));
            res.status(400).json({
              message: `This would exceed the planned allocation of ${budget.toFixed(1)}h. You have ${remaining.toFixed(2)}h remaining.`,
            }); return;
          }
        }
      }
    }

    // ── Apply validated field updates ─────────────────────────────────────────
    if (projectWork !== undefined) entry.projectWork = String(projectWork).slice(0, 500);
    if (hours       !== undefined) entry.hours       = Math.max(0, Math.min(8, Number(hours)));
    if (minutes     !== undefined) entry.minutes     = Math.max(0, Math.min(59, Number(minutes)));
    if (remarks     !== undefined) entry.remarks     = String(remarks).slice(0, 500);

    recalculateMonthTotals(month);

    const totalAuthorizedHours = project
      ? project.contractedHours + project.additionalApprovedHours
      : 0;
    recalculateAuthorizedHours(timesheet.months, totalAuthorizedHours);

    const hoursUsed = Math.round(
      timesheet.months.reduce((s, m) => s + m.monthlyTotal, 0) * 100
    ) / 100;

    if (project) {
      // Targeted field update — skips the full pre-save hook chain (engineer
      // allocation validation + totalAuthorizedHours recompute) which is
      // expensive and irrelevant when only hoursUsed changed.
      const projectUpdate: Record<string, unknown> = { hoursUsed };
      if (project.maxAllowedHours > 0) {
        projectUpdate.isNearLimit =
          (hoursUsed / project.maxAllowedHours) * 100 >= project.alertThreshold;
      }
      await Project.updateOne({ _id: projectId }, { $set: projectUpdate });
    }

    await timesheet.save();

    auditLogger({
      req,
      action:      'TIMESHEET_ENTRY_UPDATED',
      module:      'TIMESHEETS',
      entityId:    `${projectId}/${engineerId}/${year}/${monthIndex}/${entryId}`,
      entityLabel: `${year}-${monthIndex + 1}-${entryId}`,
      metadata:    { projectId, engineerId, year, monthIndex },
    });

    res.json({ month, hoursUsed });
  } catch (err: unknown) {
    console.error('[Timesheet] updateEntry error:', err);
    res.status(500).json({ message: 'Server error', ...safeError(err) });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/timesheets/:projectId/:engineerId/:year/:monthIndex/lock
// Admin locks or unlocks a month. Creates a notification for the engineer.
// ─────────────────────────────────────────────────────────────────────────────
export const lockMonth = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId, engineerId, year: yearStr, monthIndex: monthStr } = req.params;
    const year       = parseInt(yearStr,  10);
    const monthIndex = parseInt(monthStr, 10);
    const { lock }   = req.body;

    const timesheet = await Timesheet.findOne({ project: projectId, engineer: engineerId, year });
    if (!timesheet) { res.status(404).json({ message: 'Timesheet not found' }); return; }

    const month = timesheet.months.find(m => m.monthIndex === monthIndex);
    if (!month) { res.status(404).json({ message: 'Month not found' }); return; }

    month.isLocked = !!lock;
    month.lockedAt = lock ? new Date() : undefined;
    month.lockedBy = lock ? new mongoose.Types.ObjectId(req.user!.id) : undefined;

    await timesheet.save();

    auditLogger({
      req,
      action:      lock ? 'TIMESHEET_MONTH_LOCKED' : 'TIMESHEET_MONTH_UNLOCKED',
      module:      'TIMESHEETS',
      entityId:    `${projectId}/${engineerId}/${year}/${monthIndex}`,
      entityLabel: `${month.monthName} ${year}`,
      metadata:    { projectId, engineerId, year, monthIndex },
    });

    // Notify the engineer when their month is locked
    if (lock) {
      await Notification.create({
        user:    engineerId,
        project: projectId,
        type:    'TIMESHEET_SUBMITTED',
        message: `Your timesheet for ${month.monthName} ${year} has been locked by admin.`,
      });
    }

    res.json({ message: lock ? 'Month locked' : 'Month unlocked', monthIndex, isLocked: month.isLocked });
  } catch (err: unknown) {
    console.error('[Timesheet] lockMonth error:', err);
    res.status(500).json({ message: 'Server error', ...safeError(err) });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/timesheets/generate
// Admin manually generates / re-generates a timesheet.
// Refuses to overwrite an existing timesheet that has logged hours unless
// { force: true } is passed in the body.
// ─────────────────────────────────────────────────────────────────────────────
export const generateTimesheet = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId, engineerId, year: yearParam, force = false } = req.body;
    if (!projectId || !engineerId) {
      res.status(400).json({ message: 'projectId and engineerId are required' }); return;
    }

    const project = await Project.findById(projectId);
    if (!project) { res.status(404).json({ message: 'Project not found' }); return; }

    const year = yearParam
      ? parseInt(yearParam, 10)
      : (project.startDate ? new Date(project.startDate).getFullYear() : new Date().getFullYear());

    // Guard — do not silently destroy existing data
    const existing = await Timesheet.findOne({ project: projectId, engineer: engineerId, year });
    const hasLoggedHours = existing?.months.some(m => m.monthlyTotal > 0);
    if (existing && hasLoggedHours && !force) {
      res.status(409).json({
        message: 'This timesheet already has logged hours. Pass force:true to overwrite (destructive).',
        hasLoggedHours: true,
      });
      return;
    }

    const totalAuthorizedHours = project.contractedHours + project.additionalApprovedHours;
    const months = generateYearSheets(year, totalAuthorizedHours);

    const timesheet = await Timesheet.findOneAndUpdate(
      { project: projectId, engineer: engineerId, year },
      { project: projectId, engineer: engineerId, year, months },
      { upsert: true, new: true },
    );

    res.status(201).json({ message: 'Timesheet generated', timesheet });
  } catch (err: unknown) {
    console.error('[Timesheet] generate error:', err);
    res.status(500).json({ message: 'Server error', ...safeError(err) });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/timesheets/rebuild-structure
// Admin: rebuild calendar skeleton using cursor iteration (memory-safe).
// ─────────────────────────────────────────────────────────────────────────────
export const rebuildAllStructure = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let rebuilt = 0;

    // Prefetch all projects referenced by timesheets — 2 queries total instead
    // of 1 query per timesheet document (eliminates the N+1 pattern).
    const projectIds = await Timesheet.distinct('project');
    const projectDocs = await Project.find(
      { _id: { $in: projectIds } },
      { contractedHours: 1, additionalApprovedHours: 1 }
    ).lean();
    const projectMap = new Map(
      projectDocs.map((p) => [String(p._id), p as { contractedHours: number; additionalApprovedHours: number }])
    );

    // Use .cursor() to iterate one document at a time — avoids loading all
    // timesheets into memory simultaneously (N × 12 months × ~31 entries each)
    const cursor = Timesheet.find({}).cursor();

    for await (const ts of cursor) {
      const project = projectMap.get(String(ts.project));
      const totalAuthorizedHours = project
        ? project.contractedHours + project.additionalApprovedHours
        : 0;

      const freshMonths = generateYearSheets(ts.year, totalAuthorizedHours);

      for (const freshMonth of freshMonths) {
        const oldMonth = ts.months.find(m => m.monthIndex === freshMonth.monthIndex);
        if (!oldMonth) continue;

        for (const freshEntry of freshMonth.entries) {
          const oldEntry = oldMonth.entries.find((e: any) => e.sno === freshEntry.sno);
          if (oldEntry) {
            freshEntry.projectWork = (oldEntry as any).projectWork || '';
            freshEntry.hours       = (oldEntry as any).hours       || 0;
            freshEntry.minutes     = (oldEntry as any).minutes     || 0;
            freshEntry.remarks     = (oldEntry as any).remarks     || '';
            freshEntry.totalHours  = Math.round((freshEntry.hours + freshEntry.minutes / 60) * 100) / 100;
          }
        }

        recalculateMonthTotals(freshMonth);
        freshMonth.isLocked = oldMonth.isLocked;
        freshMonth.lockedAt = oldMonth.lockedAt;
        freshMonth.lockedBy = oldMonth.lockedBy;
      }

      recalculateAuthorizedHours(freshMonths, totalAuthorizedHours);
      await Timesheet.updateOne({ _id: ts._id }, { $set: { months: freshMonths } });
      rebuilt++;
    }

    res.json({ message: `Rebuilt ${rebuilt} timesheet(s) with correct calendar structure` });
  } catch (err: unknown) {
    console.error('[Timesheet] rebuildAllStructure error:', err);
    res.status(500).json({ message: 'Server error', ...safeError(err) });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/timesheets/project/:projectId  — admin: all engineers for a project
// ─────────────────────────────────────────────────────────────────────────────
export const getProjectTimesheets = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    if (!isValidObjectId(projectId)) {
      res.status(400).json({ message: 'Invalid projectId' }); return;
    }
    const year = req.query.year ? parseInt(req.query.year as string, 10) : new Date().getFullYear();
    if (isNaN(year) || year < 2000 || year > 2100) {
      res.status(400).json({ message: 'Invalid year' }); return;
    }

    const timesheets = await Timesheet.find({ project: projectId, year })
      .populate('engineer', 'name email')
      .select('engineer year months.monthName months.monthlyTotal months.isLocked months.monthIndex');

    res.json({ timesheets });
  } catch (err: unknown) {
    console.error('[Timesheet] getProjectTimesheets error:', err);
    res.status(500).json({ message: 'Server error', ...safeError(err) });
  }
};
