import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../../middleware/auth.middleware';
import * as PartnerService from '../services/PartnerService';
import { auditLogger } from '../../../utils/auditLogger';

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
export async function getPartners(req: AuthRequest, res: Response, next: NextFunction) {
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
export async function getPartner(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const partner = await PartnerService.getPartnerById(req.params.id);
    if (!partner) return res.status(404).json({ success: false, message: 'Partner not found' });
    res.json({ success: true, data: partner });
  } catch (err) {
    next(err);
  }
}

// POST /api/partners
export async function createPartner(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const data    = filterBody(req.body);
    if (!data.name) return res.status(400).json({ success: false, message: 'name is required' });
    const partner = await PartnerService.createPartner(data as any, req.user!.id);

    auditLogger({
      req,
      action:      'PARTNER_CREATED',
      module:      'PARTNERS',
      entityId:    String(partner._id),
      entityLabel: partner.name,
      newValues:   { name: partner.name, type: (partner as any).type, contactEmail: (partner as any).contactEmail },
    });

    res.status(201).json({ success: true, data: partner });
  } catch (err) {
    const status = serviceErrorToStatus(err);
    const msg    = err instanceof Error ? err.message : 'Internal server error';
    if (status !== 500) return res.status(status).json({ success: false, message: msg });
    next(err);
  }
}

// PUT /api/partners/:id
export async function updatePartner(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    // Fetch before-state for diff
    const before  = await PartnerService.getPartnerById(req.params.id);
    if (!before) return res.status(404).json({ success: false, message: 'Partner not found' });

    const data    = filterBody(req.body);
    const updated = await PartnerService.updatePartner(req.params.id, data as any);
    if (!updated) return res.status(404).json({ success: false, message: 'Partner not found' });

    // Build field-level diff for changed keys only
    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};
    Object.keys(data).forEach(k => {
      const o = (before as any)[k];
      const n = (updated as any)[k];
      if (JSON.stringify(o) !== JSON.stringify(n)) {
        oldValues[k] = o;
        newValues[k] = n;
      }
    });

    auditLogger({
      req,
      action:      'PARTNER_UPDATED',
      module:      'PARTNERS',
      entityId:    String(updated._id),
      entityLabel: updated.name,
      oldValues:   Object.keys(oldValues).length ? oldValues : undefined,
      newValues:   Object.keys(newValues).length ? newValues : undefined,
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    const status = serviceErrorToStatus(err);
    const msg    = err instanceof Error ? err.message : 'Internal server error';
    if (status !== 500) return res.status(status).json({ success: false, message: msg });
    next(err);
  }
}

// DELETE /api/partners/:id
export async function deletePartner(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const partner = await PartnerService.getPartnerById(req.params.id);

    await PartnerService.deletePartner(req.params.id);

    if (partner) {
      auditLogger({
        req,
        action:      'PARTNER_DELETED',
        module:      'PARTNERS',
        entityId:    String(partner._id),
        entityLabel: partner.name,
        oldValues:   { name: partner.name, type: (partner as any).type, isActive: (partner as any).isActive },
      });
    }

    res.json({ success: true, message: 'Partner deleted' });
  } catch (err) {
    const status = serviceErrorToStatus(err);
    const msg    = err instanceof Error ? err.message : 'Internal server error';
    if (status !== 500) return res.status(status).json({ success: false, message: msg });
    next(err);
  }
}
