import { Router } from 'express';
import { protect } from '../../../middleware/auth.middleware';
import { dealUpload } from '../../../services/storageService';
import * as attachmentController from '../controllers/attachment.controller';

// Mounted at /api/deals/:id/attachments via mergeParams
const router = Router({ mergeParams: true });

router.use(protect);

router.get('/',    attachmentController.listAttachments);
router.post('/',   dealUpload.single('file'), attachmentController.uploadAttachment);
router.delete('/:attachmentId', attachmentController.deleteAttachment);

export default router;
