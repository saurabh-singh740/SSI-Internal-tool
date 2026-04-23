import { Router } from 'express';
import { protect, requireRole } from '../../../middleware/auth.middleware';
import { perUserWriteLimiter } from '../../../middleware/rateLimiters';
import {
  getDeals,
  getPipeline,
  getDealById,
  createDeal,
  updateDeal,
  changeDealStage,
  addNote,
  updateSOW,
  getDealActivities,
  convertDealToProject,
  deleteDeal,
} from '../controllers/deal.controller';
import {
  saveResourcePlan,
  getTimesheetPreview,
  computeTimesheetPreview,
} from '../controllers/resourcePlan.controller';

const router = Router();

// All deal routes require authentication
router.use(protect);

// ── Read ──────────────────────────────────────────────────────────────────────
router.get('/',          getDeals);
router.get('/pipeline',  getPipeline);
router.get('/:id',       getDealById);
router.get('/:id/activities', getDealActivities);

// ── Mutations ─────────────────────────────────────────────────────────────────
router.post('/',   requireRole('ADMIN', 'ENGINEER'), perUserWriteLimiter, createDeal);
router.put('/:id', requireRole('ADMIN', 'ENGINEER'), perUserWriteLimiter, updateDeal);

// Stage transition — owner/team members can advance; ADMIN always can
router.patch('/:id/stage', perUserWriteLimiter, changeDealStage);

// SOW
router.put('/:id/sow',   requireRole('ADMIN', 'ENGINEER'), perUserWriteLimiter, updateSOW);

// Note
router.post('/:id/notes', perUserWriteLimiter, addNote);

// Resource planning (tentative engineers — no timesheets created)
// Live preview: stateless POST with entries in body — must come before /:id routes
router.post('/live-preview', computeTimesheetPreview);
router.get( '/:id/timesheet-preview', getTimesheetPreview);
router.put( '/:id/resource-plan', requireRole('ADMIN', 'ENGINEER'), perUserWriteLimiter, saveResourcePlan);

// Conversion — ADMIN only (most sensitive operation)
router.post('/:id/convert', requireRole('ADMIN'), convertDealToProject);

// Delete — ADMIN only
router.delete('/:id', requireRole('ADMIN'), deleteDeal);

export default router;
