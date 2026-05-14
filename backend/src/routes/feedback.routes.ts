import { Router } from 'express';
import {
  submitFeedback,
  listFeedback,
  getMyFeedback,
  getReceivedFeedback,
  getFeedbackStats,
  getProjectFeedback,
  getFeedback,
  updateFeedbackStatus,
  reviewFeedback,
  toggleFollowUp,
  bulkUpdateStatus,
  deleteFeedback,
  exportFeedback,
} from '../controllers/feedback.controller';
import { protect, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(protect);

// ── Admin analytics ───────────────────────────────────────────────────────────
router.get('/stats',  requireRole('ADMIN'), getFeedbackStats);
router.get('/export', requireRole('ADMIN'), exportFeedback);

// ── Bulk operations (admin) ───────────────────────────────────────────────────
router.patch('/bulk-status', requireRole('ADMIN'), bulkUpdateStatus);

// ── Per-project list (admin) ──────────────────────────────────────────────────
router.get('/project/:projectId', requireRole('ADMIN'), getProjectFeedback);

// ── Own history — must be before /:id ────────────────────────────────────────
router.get('/my',       requireRole('ADMIN', 'CUSTOMER', 'ENGINEER'), getMyFeedback);
router.get('/received', requireRole('ADMIN', 'ENGINEER'),             getReceivedFeedback);

// ── CRUD ──────────────────────────────────────────────────────────────────────
router.get('/',    requireRole('ADMIN'),                               listFeedback);
router.post('/',   requireRole('ADMIN', 'CUSTOMER', 'ENGINEER'),       submitFeedback);
router.get('/:id', requireRole('ADMIN', 'CUSTOMER', 'ENGINEER'),       getFeedback);

router.patch('/:id/status',    requireRole('ADMIN'), updateFeedbackStatus);
router.patch('/:id/review',    requireRole('ADMIN'), reviewFeedback);
router.patch('/:id/follow-up', requireRole('ADMIN'), toggleFollowUp);
router.delete('/:id',          requireRole('ADMIN'), deleteFeedback);

export default router;
