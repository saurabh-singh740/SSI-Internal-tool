import { Router } from 'express';
import multer from 'multer';
import path from 'path';
// fs intentionally omitted — serverless environments (Vercel /var/task) are
// read-only.  All file handling is in-memory via multer.memoryStorage().
import {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  getProjectMetrics,
  getProjectStats,
} from '../controllers/project.controller';
import { assignEngineer, confirmInvite, addEngineerToProject, removeEngineerFromProject } from '../controllers/engineer.controller';
import { protect, requireRole } from '../middleware/auth.middleware';
import { perUserWriteLimiter } from '../middleware/rateLimiters';
import Project from '../models/Project';
import { AuthRequest } from '../middleware/auth.middleware';
import { Response } from 'express';

const router = Router();

// ── Multer — memory storage ───────────────────────────────────────────────────
// diskStorage + fs.mkdirSync crash on Vercel because /var/task is read-only.
// memoryStorage keeps the uploaded bytes in req.file.buffer with zero disk I/O,
// which works identically in local dev and in every serverless environment.
//
// ⚠ For production file hosting replace the base64-in-MongoDB approach below
//   with Vercel Blob (@vercel/blob) or Cloudinary.  The base64 path is safe
//   only for attachments ≤ 3 MB (MongoDB's 16 MB document limit).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB — multer rejects before handler
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.docx', '.xlsx', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Invalid file type'));
  },
});

router.use(protect);

// Stats (before :id routes)
router.get('/stats/summary', requireRole('ADMIN'), getProjectStats);

// Cleanup: remove engineer subdocs whose User ref no longer exists.
router.post('/cleanup/null-engineers', requireRole('ADMIN'), async (_req, res: Response) => {
  try {
    const projects = await Project.find({}).populate('engineers.engineer', '_id');
    let modifiedCount = 0;

    for (const proj of projects) {
      const staleIds = (proj.engineers as any[])
        .filter((e) => e.engineer === null || e.engineer === undefined)
        .map((e) => e._id);

      if (staleIds.length > 0) {
        await Project.updateOne(
          { _id: proj._id },
          { $pull: { engineers: { _id: { $in: staleIds } } } }
        );
        modifiedCount++;
      }
    }

    res.json({ message: 'Cleanup done', modifiedCount });
  } catch (err: any) {
    res.status(500).json({ message: err.message || 'Cleanup failed' });
  }
});

// Engineer assignment + invite confirmation
router.post('/assign-engineer', requireRole('ADMIN'), assignEngineer);
router.get('/invite/:token', confirmInvite);

// Inline engineer management on ViewProject (no full-form edit needed)
router.post(  '/:id/engineers',              requireRole('ADMIN'), perUserWriteLimiter, addEngineerToProject);
router.delete('/:id/engineers/:engineerId',  requireRole('ADMIN'), removeEngineerFromProject);

// CRUD
router.get('/',    getProjects);
router.post('/',   requireRole('ADMIN'), perUserWriteLimiter, createProject);
router.get('/:id', getProjectById);
router.put('/:id', requireRole('ADMIN'), perUserWriteLimiter, updateProject);
router.delete('/:id', requireRole('ADMIN'), deleteProject);

// Metrics
router.get('/:id/metrics', getProjectMetrics);

// ── File upload ───────────────────────────────────────────────────────────────
router.post(
  '/:id/attachments',
  requireRole('ADMIN'),
  upload.single('file'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ message: 'No file uploaded' });
        return;
      }

      // Guard: base64 inflates size by ~33 %.  Reject files that would push
      // the attachment subdoc above MongoDB's 16 MB document limit.
      const MAX_INLINE_BYTES = 3 * 1024 * 1024; // 3 MB
      if (req.file.size > MAX_INLINE_BYTES) {
        res.status(413).json({
          message: `File too large for inline storage (${(req.file.size / 1024 / 1024).toFixed(1)} MB). Max 3 MB. Use Vercel Blob or Cloudinary for larger files.`,
        });
        return;
      }

      const project = await Project.findById(req.params.id);
      if (!project) {
        res.status(404).json({ message: 'Project not found' });
        return;
      }

      // Generate the same unique filename the old diskStorage callback produced.
      const unique   = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const filename = `${unique}${path.extname(req.file.originalname)}`;

      // Encode to base64 data URL — readable directly by <img src="..."> and
      // PDF viewers without needing a CDN or static-file server.
      const dataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

      const attachment = {
        filename,
        originalName: req.file.originalname,
        fileType:     path.extname(req.file.originalname).replace('.', '').toUpperCase(),
        url:          dataUrl,
        uploadedAt:   new Date(),
      };

      project.attachments.push(attachment);
      await project.save();

      // Return metadata only — omit the full data URL from the response body
      // (it can be several MB; the client fetches it from the project record).
      res.status(201).json({
        message:    'File uploaded',
        attachment: {
          filename:     attachment.filename,
          originalName: attachment.originalName,
          fileType:     attachment.fileType,
          uploadedAt:   attachment.uploadedAt,
        },
      });
    } catch (error) {
      res.status(500).json({ message: 'Upload failed', error });
    }
  },
);

// ── Delete attachment ─────────────────────────────────────────────────────────
router.delete(
  '/:id/attachments/:attachmentId',
  requireRole('ADMIN'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const project = await Project.findById(req.params.id);
      if (!project) {
        res.status(404).json({ message: 'Project not found' });
        return;
      }

      // No disk cleanup needed — files are stored as base64 inside the document.
      project.attachments = project.attachments.filter(
        (a: any) => String(a._id) !== req.params.attachmentId,
      ) as any;
      await project.save();

      res.json({ message: 'Attachment deleted' });
    } catch (error) {
      res.status(500).json({ message: 'Server error', error });
    }
  },
);

export default router;
