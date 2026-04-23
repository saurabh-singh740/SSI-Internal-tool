/**
 * Deal controller — thin HTTP layer.
 *
 * Validates input via the allowlist pattern (matching project.controller.ts),
 * delegates all business logic to DealService / ConversionService, and maps
 * service errors to HTTP responses.
 */
import { Response } from 'express';
import { AuthRequest } from '../../../middleware/auth.middleware';
import { filterBody } from '../../../utils/filterBody';
import { safeError } from '../../../utils/apiError';
import { dealService, DealFilter } from '../services/DealService';
import { conversionService, ConversionOverrides } from '../services/ConversionService';
import { DealStage } from '../../../models/Deal';

// ── Allowlists ────────────────────────────────────────────────────────────────

const DEAL_WRITABLE_FIELDS = [
  'title', 'priority', 'clientCompany', 'clientDomain', 'contacts',
  'source', 'referredBy', 'estimatedValue', 'currency', 'estimatedHours',
  'proposedRate', 'billingType', 'expectedCloseDate', 'proposedStartDate',
  'proposedEndDate', 'sowFinalised', 'winProbability',
  'owner', 'team', 'customFields', 'tags', 'partnerId',
] as const;

const CONVERSION_OVERRIDE_FIELDS = [
  'name', 'code', 'type', 'clientName', 'clientCompany', 'clientEmail',
  'clientPhone', 'startDate', 'endDate', 'billingType', 'hourlyRate',
  'currency', 'contractedHours', 'engineers',
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function serviceErrorToStatus(err: unknown): number {
  const e = err as any;
  if (e?.statusCode) return e.statusCode;
  return 500;
}

// ── GET /api/deals ────────────────────────────────────────────────────────────

export const getDeals = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const filter: DealFilter = {
      stage:     req.query.stage     as DealStage | undefined,
      ownerId:   req.query.owner     as string    | undefined,
      search:    req.query.search    as string    | undefined,
      tag:       req.query.tag       as string    | undefined,
      archived:  req.query.archived  === 'true',
      partnerId: req.query.partnerId as string    | undefined,
    };

    const deals = await dealService.getDeals(req.user!.id, req.user!.role, filter);
    res.json({ deals, total: deals.length });
  } catch (err) {
    res.status(500).json({ message: 'Server error', ...safeError(err) });
  }
};

// ── GET /api/deals/pipeline ───────────────────────────────────────────────────

export const getPipeline = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const filter = {
      ownerId:   req.query.owner     as string | undefined,
      search:    req.query.search    as string | undefined,
      tag:       req.query.tag       as string | undefined,
      partnerId: req.query.partnerId as string | undefined,
    };

    const pipeline = await dealService.getPipeline(req.user!.id, req.user!.role, filter);
    res.json({ pipeline });
  } catch (err) {
    res.status(500).json({ message: 'Server error', ...safeError(err) });
  }
};

// ── GET /api/deals/:id ────────────────────────────────────────────────────────

export const getDealById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const deal = await dealService.getDealById(req.params.id);
    if (!deal) { res.status(404).json({ message: 'Deal not found' }); return; }
    res.json({ deal });
  } catch (err) {
    res.status(500).json({ message: 'Server error', ...safeError(err) });
  }
};

// ── POST /api/deals ───────────────────────────────────────────────────────────

export const createDeal = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = filterBody(req.body, DEAL_WRITABLE_FIELDS);
    const deal = await dealService.createDeal(data as any, req.user!.id);
    res.status(201).json({ deal });
  } catch (err) {
    res.status(serviceErrorToStatus(err)).json({ message: (err as Error).message, ...safeError(err) });
  }
};

// ── PUT /api/deals/:id ────────────────────────────────────────────────────────

export const updateDeal = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const data = filterBody(req.body, DEAL_WRITABLE_FIELDS);
    const deal = await dealService.updateDeal(req.params.id, data as any, req.user!.id);
    res.json({ deal });
  } catch (err) {
    res.status(serviceErrorToStatus(err)).json({ message: (err as Error).message, ...safeError(err) });
  }
};

// ── PATCH /api/deals/:id/stage ────────────────────────────────────────────────

export const changeDealStage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { stage, lostReason, lostNote, note } = req.body;

    if (!stage) { res.status(400).json({ message: 'stage is required' }); return; }

    const deal = await dealService.changeStage(
      req.params.id,
      stage as DealStage,
      req.user!.id,
      { lostReason, lostNote, note }
    );

    res.json({ deal });
  } catch (err) {
    res.status(serviceErrorToStatus(err)).json({ message: (err as Error).message, ...safeError(err) });
  }
};

// ── POST /api/deals/:id/notes ─────────────────────────────────────────────────

export const addNote = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { note } = req.body;
    if (!note?.trim()) { res.status(400).json({ message: 'note is required' }); return; }
    const result = await dealService.addNote(req.params.id, note.trim(), req.user!.id);
    res.status(201).json(result);
  } catch (err) {
    res.status(serviceErrorToStatus(err)).json({ message: (err as Error).message, ...safeError(err) });
  }
};

// ── PUT /api/deals/:id/sow ────────────────────────────────────────────────────

export const updateSOW = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { sowSections } = req.body;
    if (!Array.isArray(sowSections)) {
      res.status(400).json({ message: 'sowSections must be an array' });
      return;
    }
    const deal = await dealService.updateSOW(req.params.id, sowSections, req.user!.id);
    res.json({ deal });
  } catch (err) {
    res.status(serviceErrorToStatus(err)).json({ message: (err as Error).message, ...safeError(err) });
  }
};

// ── GET /api/deals/:id/activities ─────────────────────────────────────────────

export const getDealActivities = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const limit  = Math.min(50, parseInt(req.query.limit  as string) || 20);
    const cursor = req.query.cursor as string | undefined;
    const result = await dealService.getActivities(req.params.id, limit, cursor);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: 'Server error', ...safeError(err) });
  }
};

// ── POST /api/deals/:id/convert ───────────────────────────────────────────────
// Admin-only — enforced in routes via requireRole('ADMIN')

export const convertDealToProject = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const overrides = filterBody(req.body, CONVERSION_OVERRIDE_FIELDS) as ConversionOverrides;
    const result    = await conversionService.convertToProject(req.params.id, req.user!.id, overrides);
    res.status(201).json({
      message: 'Deal successfully converted to project',
      project: result.project,
      deal:    result.deal,
    });
  } catch (err) {
    const e = err as any;
    const status = e?.statusCode ?? 500;
    res.status(status).json({
      message:   e.message,
      projectId: e.projectId ?? undefined,
      ...safeError(err),
    });
  }
};

// ── DELETE /api/deals/:id ─────────────────────────────────────────────────────

export const deleteDeal = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await dealService.deleteDeal(req.params.id);
    res.json({ message: 'Deal deleted' });
  } catch (err) {
    res.status(serviceErrorToStatus(err)).json({ message: (err as Error).message, ...safeError(err) });
  }
};
