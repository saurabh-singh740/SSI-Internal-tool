import { Request, Response, NextFunction } from 'express';
import * as PartnerService from '../services/PartnerService';

const PARTNER_WRITABLE_FIELDS = [
  'name', 'type', 'contactName', 'contactEmail',
  'contactPhone', 'website', 'country', 'notes', 'isActive',
] as const;

function filterBody(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const key of PARTNER_WRITABLE_FIELDS) {
    if (key in body) out[key] = body[key];
  }
  return out;
}

function serviceErrorToStatus(err: unknown): number {
  const e = err as any;
  return typeof e?.statusCode === 'number' ? e.statusCode : 500;
}

// GET /api/partners
export async function getPartners(req: Request, res: Response, next: NextFunction) {
  try {
    const isActive = req.query.isActive !== undefined
      ? req.query.isActive === 'true'
      : undefined;
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    const partners = await PartnerService.listPartners({ isActive, type });
    res.json({ success: true, data: partners });
  } catch (err) {
    next(err);
  }
}

// GET /api/partners/:id
export async function getPartner(req: Request, res: Response, next: NextFunction) {
  try {
    const partner = await PartnerService.getPartnerById(req.params.id);
    if (!partner) return res.status(404).json({ success: false, message: 'Partner not found' });
    res.json({ success: true, data: partner });
  } catch (err) {
    next(err);
  }
}

// POST /api/partners
export async function createPartner(req: Request, res: Response, next: NextFunction) {
  try {
    const actorId = (req as any).user._id.toString();
    const data    = filterBody(req.body);
    if (!data.name) return res.status(400).json({ success: false, message: 'name is required' });
    const partner = await PartnerService.createPartner(data as any, actorId);
    res.status(201).json({ success: true, data: partner });
  } catch (err) {
    const status = serviceErrorToStatus(err);
    const msg    = err instanceof Error ? err.message : 'Internal server error';
    if (status !== 500) return res.status(status).json({ success: false, message: msg });
    next(err);
  }
}

// PUT /api/partners/:id
export async function updatePartner(req: Request, res: Response, next: NextFunction) {
  try {
    const data    = filterBody(req.body);
    const updated = await PartnerService.updatePartner(req.params.id, data as any);
    if (!updated) return res.status(404).json({ success: false, message: 'Partner not found' });
    res.json({ success: true, data: updated });
  } catch (err) {
    const status = serviceErrorToStatus(err);
    const msg    = err instanceof Error ? err.message : 'Internal server error';
    if (status !== 500) return res.status(status).json({ success: false, message: msg });
    next(err);
  }
}

// DELETE /api/partners/:id
export async function deletePartner(req: Request, res: Response, next: NextFunction) {
  try {
    await PartnerService.deletePartner(req.params.id);
    res.json({ success: true, message: 'Partner deleted' });
  } catch (err) {
    const status = serviceErrorToStatus(err);
    const msg    = err instanceof Error ? err.message : 'Internal server error';
    if (status !== 500) return res.status(status).json({ success: false, message: msg });
    next(err);
  }
}
