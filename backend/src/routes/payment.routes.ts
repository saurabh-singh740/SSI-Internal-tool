import { Router } from 'express';
import {
  getPayments,
  getPaymentSummary,
  getProjectPayments,
  getPaymentById,
  getMyPayments,
  createPayment,
  updatePayment,
  deletePayment,
  getPaymentAuditLog,
} from '../controllers/payment.controller';
import { protect, requireRole } from '../middleware/auth.middleware';

const router = Router();

// All payment routes require authentication
router.use(protect);

// Engineers are blocked at controller level (403) so no global requireRole here —
// this allows CUSTOMER to read their project payments.

// ── Summary metrics (admin only) ──────────────────────────────────────────────
router.get('/summary', requireRole('ADMIN'), getPaymentSummary);

// ── Project-scoped list ───────────────────────────────────────────────────────
router.get('/project/:projectId', getProjectPayments);

// ── Audit log (admin only) ────────────────────────────────────────────────────
router.get('/:id/audit', requireRole('ADMIN'), getPaymentAuditLog);

// ── Engineer: payments for my assigned projects ───────────────────────────────
// MUST be registered before /:id — otherwise Express would match "my" as an id.
router.get('/my', requireRole('ENGINEER'), getMyPayments);

// ── CRUD ──────────────────────────────────────────────────────────────────────
router.get('/',    getPayments);
router.post('/',   requireRole('ADMIN'), createPayment);
router.get('/:id', getPaymentById);
router.patch('/:id', requireRole('ADMIN'), updatePayment);
router.delete('/:id', requireRole('ADMIN'), deletePayment);

export default router;
