import { Router } from 'express';
import {
  getAuditLogs,
  getAuditStats,
  getRetentionPolicy,
  getAuditLogById,
} from '../controllers/auditLog.controller';
import { protect, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.use(protect, requireRole('ADMIN'));

router.get('/',           getAuditLogs);
router.get('/stats',      getAuditStats);
router.get('/retention',  getRetentionPolicy);  // must be before /:id
router.get('/:id',        getAuditLogById);

export default router;
