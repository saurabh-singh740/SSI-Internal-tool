import { Router } from 'express';
import {
  createUser,
  getAllUsers,
  getEngineers,
  getEngineerAllocation,
  getUserById,
  updateUser,
  deleteUser,
} from '../controllers/user.controller';
import { protect, requireRole } from '../middleware/auth.middleware';
import {
  preventLastAdminDeletion,
  preventLastAdminDemotion,
} from '../middleware/adminGuards';

const router = Router();

router.use(protect);

// ── Admin-only mutations ──────────────────────────────────────────────────────
router.post('/', requireRole('ADMIN'), createUser);
router.get('/',  requireRole('ADMIN'), getAllUsers);

// Engineers endpoint — needed by assignment dropdowns; supports ?search=&limit=
router.get('/engineers', requireRole('ADMIN', 'ENGINEER'), getEngineers);

// ── Single-user operations ────────────────────────────────────────────────────
// getUserById: non-admin users may only view their own profile (enforced in controller)
router.get('/:id', getUserById);

// Cross-project allocation view — admin sees anyone, engineer sees own only
router.get('/:id/allocation', getEngineerAllocation);

// updateUser: guards fire BEFORE the controller to reject demotion of last admin
router.put('/:id', requireRole('ADMIN'), preventLastAdminDemotion, updateUser);

// deleteUser: guards fire BEFORE the controller to reject deletion of last admin
router.delete('/:id', requireRole('ADMIN'), preventLastAdminDeletion, deleteUser);

export default router;
