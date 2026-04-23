import { Request, Response, NextFunction } from 'express';
import * as ResourcePlanService from '../services/ResourcePlanService';
import { ResourcePlanInput } from '../services/ResourcePlanService';

const ENTRY_WRITABLE_FIELDS = [
  'engineer', 'role', 'allocationPercentage', 'startDate', 'endDate', 'totalAuthorizedHours',
] as const;

function filterEntry(raw: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const key of ENTRY_WRITABLE_FIELDS) {
    if (key in raw) out[key] = raw[key];
  }
  return out;
}

// PUT /api/deals/:id/resource-plan
export async function saveResourcePlan(req: Request, res: Response, next: NextFunction) {
  try {
    const entries = req.body?.entries;
    if (!Array.isArray(entries)) {
      return res.status(400).json({ success: false, message: '`entries` array is required' });
    }

    const cleaned = entries.map(e => filterEntry(e as Record<string, unknown>));
    const plan    = await ResourcePlanService.saveResourcePlan(req.params.id, cleaned as any);
    res.json({ success: true, data: plan });
  } catch (err) {
    const e = err as any;
    if (typeof e?.statusCode === 'number' && e.statusCode < 500) {
      return res.status(e.statusCode).json({ success: false, message: e.message });
    }
    next(err);
  }
}

// GET /api/deals/:id/timesheet-preview  — reads persisted resourcePlan from DB
export async function getTimesheetPreview(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await ResourcePlanService.getTimesheetPreview(req.params.id);
    res.json({ success: true, data: result });
  } catch (err) {
    const e = err as any;
    if (typeof e?.statusCode === 'number' && e.statusCode < 500) {
      return res.status(e.statusCode).json({ success: false, message: e.message });
    }
    next(err);
  }
}

// POST /api/deals/:id/timesheet-preview  — live preview from request body, zero DB reads
export function computeTimesheetPreview(req: Request, res: Response, next: NextFunction) {
  try {
    const entries = req.body?.entries;
    if (!Array.isArray(entries)) {
      return res.status(400).json({ success: false, message: '`entries` array is required' });
    }
    const result = ResourcePlanService.computeTimesheetPreview(entries as ResourcePlanInput[]);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
