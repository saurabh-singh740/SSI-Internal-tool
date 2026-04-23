import { Router } from 'express';
import { protect, requireRole } from '../../../middleware/auth.middleware';
import * as partnerController from '../controllers/partner.controller';

const router = Router();

router.use(protect);

router.get('/',    partnerController.getPartners);
router.get('/:id', partnerController.getPartner);

// Only ADMIN can create / update / delete partners
router.post('/',    requireRole('ADMIN'), partnerController.createPartner);
router.put('/:id',  requireRole('ADMIN'), partnerController.updatePartner);
router.delete('/:id', requireRole('ADMIN'), partnerController.deletePartner);

export default router;
