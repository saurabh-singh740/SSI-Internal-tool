import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../../middleware/auth.middleware';
import DealAttachment from '../../../models/DealAttachment';
import Deal           from '../../../models/Deal';
import * as Storage   from '../../../services/storageService';
import { auditLogger } from '../../../utils/auditLogger';
import mongoose       from 'mongoose';

const VALID_CATEGORIES = new Set(['SOW', 'PROPOSAL', 'CONTRACT', 'CLIENT_DOCUMENT', 'OTHER']);

// GET /api/deals/:id/attachments
export async function listAttachments(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const attachments = await DealAttachment
      .find({ dealId: req.params.id })
      .sort({ createdAt: -1 })
      .populate('uploadedBy', 'name email')
      .lean();
    res.json({ success: true, data: attachments });
  } catch (err) {
    next(err);
  }
}

// POST /api/deals/:id/attachments  (multipart/form-data)
export async function uploadAttachment(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const dealId = req.params.id;

    // Verify deal exists and is not closed
    const deal = await Deal.findById(dealId).lean();
    if (!deal) return res.status(404).json({ success: false, message: 'Deal not found' });
    if ((deal as any).stage === 'LOST') {
      return res.status(400).json({ success: false, message: 'Cannot upload files to a lost deal' });
    }

    // multer puts the file on req.file
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const category = VALID_CATEGORIES.has(req.body?.category) ? req.body.category : 'OTHER';

    const result = await Storage.uploadFile(
      file.buffer,
      file.originalname,
      file.mimetype,
      'ssi/presales'
    );

    const attachment = await DealAttachment.create({
      dealId:       new mongoose.Types.ObjectId(dealId),
      url:          result.url,
      publicId:     result.publicId  || undefined,
      storageKey:   result.storageKey || undefined,
      originalName: file.originalname,
      filename:     result.publicId  || file.originalname,
      mimeType:     file.mimetype,
      sizeBytes:    file.size,
      category,
      uploadedBy:   req.user!.id,
    });

    auditLogger({
      req,
      action:      'ATTACHMENT_UPLOADED',
      module:      'DEALS',
      entityId:    dealId,
      entityLabel: (deal as any).title ?? dealId,
      newValues:   { fileName: file.originalname, category, sizeBytes: file.size, mimeType: file.mimetype },
    });

    res.status(201).json({ success: true, data: attachment });
  } catch (err) {
    const e = err as any;
    const status = typeof e?.statusCode === 'number' ? e.statusCode : 500;
    if (status !== 500) {
      return res.status(status).json({ success: false, message: e.message });
    }
    next(err);
  }
}

// DELETE /api/deals/:id/attachments/:attachmentId
export async function deleteAttachment(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id: dealId, attachmentId } = req.params;

    const attachment = await DealAttachment.findOne({ _id: attachmentId, dealId });
    if (!attachment) {
      return res.status(404).json({ success: false, message: 'Attachment not found' });
    }

    // Remove from cloud storage
    if (attachment.publicId) {
      await Storage.deleteFile(attachment.publicId, attachment.mimeType);
    }

    await attachment.deleteOne();

    auditLogger({
      req,
      action:      'ATTACHMENT_DELETED',
      module:      'DEALS',
      entityId:    dealId,
      entityLabel: attachment.originalName,
      oldValues:   { fileName: attachment.originalName, category: attachment.category, sizeBytes: attachment.sizeBytes },
    });

    res.json({ success: true, message: 'Attachment deleted' });
  } catch (err) {
    next(err);
  }
}
