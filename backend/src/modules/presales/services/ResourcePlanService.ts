/**
 * ResourcePlanService — manages tentative engineer assignments on a Deal.
 *
 * Strict boundary: this service NEVER writes Timesheet documents.
 * It only stores IResourcePlanEntry[] on the Deal and delegates
 * projection calculation to the shared TimesheetEngine.
 */
import mongoose from 'mongoose';
import Deal, { IResourcePlanEntry } from '../../../models/Deal';
import User from '../../../models/User';
import {
  previewTimesheets,
  EngineerProjection,
  ResourceAssignment,
} from '../../../shared/timesheetEngine';

export interface ResourcePlanInput {
  engineer:             string;
  role:                 'LEAD_ENGINEER' | 'ENGINEER' | 'REVIEWER';
  allocationPercentage: number;
  startDate?:           string;
  endDate?:             string;
  totalAuthorizedHours?: number;
}

// ── Save (replaces entire resourcePlan array) ─────────────────────────────────

export async function saveResourcePlan(
  dealId:  string,
  entries: ResourcePlanInput[]
): Promise<IResourcePlanEntry[]> {
  const deal = await Deal.findById(dealId);
  if (!deal) throw Object.assign(new Error('Deal not found'), { statusCode: 404 });
  if (deal.stage === 'LOST') {
    throw Object.assign(new Error('Cannot modify a lost deal'), { statusCode: 400 });
  }

  // Validate all engineers exist and have ENGINEER role
  const engineerIds = [...new Set(entries.map(e => e.engineer))];
  const users = await User.find({ _id: { $in: engineerIds }, role: { $in: ['ENGINEER', 'ADMIN'] } })
    .select('_id')
    .lean();

  const validIds = new Set(users.map(u => u._id.toString()));
  const invalid  = engineerIds.filter(id => !validIds.has(id));
  if (invalid.length) {
    throw Object.assign(
      new Error(`Invalid user(s): ${invalid.join(', ')}`),
      { statusCode: 400 }
    );
  }

  // Validate no duplicate engineers
  const seen = new Set<string>();
  for (const e of entries) {
    if (seen.has(e.engineer)) {
      throw Object.assign(new Error('Duplicate engineer in resource plan'), { statusCode: 400 });
    }
    seen.add(e.engineer);
  }

  deal.resourcePlan = entries.map(e => ({
    engineer:             new mongoose.Types.ObjectId(e.engineer),
    role:                 e.role,
    allocationPercentage: e.allocationPercentage,
    startDate:            e.startDate ? new Date(e.startDate) : undefined,
    endDate:              e.endDate   ? new Date(e.endDate)   : undefined,
    totalAuthorizedHours: e.totalAuthorizedHours,
  })) as IResourcePlanEntry[];

  await deal.save();

  return deal.resourcePlan;
}

// ── Shared projection builder (used by both preview modes) ───────────────────

function buildPreviewFromAssignments(assignments: ResourceAssignment[]) {
  const projections = previewTimesheets(assignments);

  const totalHours = Math.round(
    projections.reduce((s, p) => s + p.totalExpectedHours, 0) * 10
  ) / 10;

  const allMonthKeys = new Set<string>();
  projections.forEach(p => p.months.forEach(m => allMonthKeys.add(`${m.year}-${m.month}`)));

  return {
    projections,
    totalHours,
    totalMonths:  allMonthKeys.size,
    engineerCount: projections.length,
  };
}

// ── Live preview — accepts entries directly in body, zero DB reads ────────────
// Called from the frontend on every debounced plan change (no save required).

export function computeTimesheetPreview(
  entries: ResourcePlanInput[]
): ReturnType<typeof buildPreviewFromAssignments> {
  const assignments: ResourceAssignment[] = entries
    .filter(e => e.startDate && e.endDate && e.engineer)
    .map(e => ({
      engineerId:           e.engineer,
      role:                 e.role,
      allocationPercentage: e.allocationPercentage,
      startDate:            new Date(e.startDate!),
      endDate:              new Date(e.endDate!),
      totalAuthorizedHours: e.totalAuthorizedHours,
    }));

  return buildPreviewFromAssignments(assignments);
}

// ── Saved preview — reads persisted resourcePlan from DB ─────────────────────
// Used on initial page load to show the last-saved simulation result.

export async function getTimesheetPreview(
  dealId: string
): Promise<ReturnType<typeof buildPreviewFromAssignments> & { resourcePlan: IResourcePlanEntry[] }> {
  const deal = await Deal.findById(dealId)
    .populate('resourcePlan.engineer', 'name email')
    .lean();

  if (!deal) throw Object.assign(new Error('Deal not found'), { statusCode: 404 });

  const plan = (deal.resourcePlan ?? []) as IResourcePlanEntry[];

  if (!plan.length) {
    return { projections: [], totalHours: 0, totalMonths: 0, engineerCount: 0, resourcePlan: [] };
  }

  const assignments: ResourceAssignment[] = plan
    .filter(e => e.startDate && e.endDate)
    .map(e => ({
      engineerId:           e.engineer.toString(),
      role:                 e.role,
      allocationPercentage: e.allocationPercentage,
      startDate:            new Date(e.startDate!),
      endDate:              new Date(e.endDate!),
      totalAuthorizedHours: e.totalAuthorizedHours,
    }));

  return { ...buildPreviewFromAssignments(assignments), resourcePlan: plan };
}
