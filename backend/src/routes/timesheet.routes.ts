import { Router } from 'express';
import {
  getOrGenerateTimesheet,
  getMonthSheet,
  getEngineerTimesheets,
  updateEntry,
  lockMonth,
  generateTimesheet,
  getProjectTimesheets,
  rebuildAllStructure,
} from '../controllers/timesheet.controller';
import { protect, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(protect);

// ── Admin operations ──────────────────────────────────────────────────────────
router.post('/generate',          requireRole('ADMIN'), generateTimesheet);
router.post('/rebuild-structure', requireRole('ADMIN'), rebuildAllStructure);
router.get('/project/:projectId', requireRole('ADMIN'), getProjectTimesheets);

// ── Batch fetch: all timesheets for one engineer in one year ──────────────────
// Engineers can only fetch their own; admins can fetch anyone
router.get('/engineer/:engineerId/:year', getEngineerTimesheets);

// ── Per-timesheet operations ──────────────────────────────────────────────────
// Metadata only (month list + totals, NO entries) — fast, ~2KB payload
router.get( '/:projectId/:engineerId/:year',                                   getOrGenerateTimesheet);
// Single month with full entries — fetched lazily per tab (~15KB payload)
router.get( '/:projectId/:engineerId/:year/:monthIndex',                       getMonthSheet);
router.patch('/:projectId/:engineerId/:year/:monthIndex/entries/:entryId',     updateEntry);
router.patch('/:projectId/:engineerId/:year/:monthIndex/lock', requireRole('ADMIN'), lockMonth);

export default router;
