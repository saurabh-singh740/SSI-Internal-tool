import { Response }    from 'express';
import mongoose        from 'mongoose';
import Feedback        from '../models/Feedback';
import Project         from '../models/Project';
import User            from '../models/User';
import Notification    from '../models/Notification';
import { AuthRequest } from '../middleware/auth.middleware';
import { auditLogger } from '../utils/auditLogger';
import { cacheGet, cacheSet, cacheDel } from '../utils/cache';

const CACHE_KEY_STATS = 'stats:feedback';
const CACHE_TTL_STATS = 60; // seconds

// ── Cursor helpers ─────────────────────────────────────────────────────────────

function encodeCursor(id: string, createdAt: Date): string {
  return Buffer.from(JSON.stringify({ id, ts: createdAt.getTime() })).toString('base64url');
}

function decodeCursor(cursor: string): { id: string; ts: number } | null {
  try { return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')); }
  catch { return null; }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Fire-and-forget: notify all admins about new feedback submission
async function notifyAdmins(projectName: string, submitterName: string, feedbackNumber: string): Promise<void> {
  try {
    const admins = await User.find({ role: 'ADMIN' }).select('_id').lean();
    if (!admins.length) return;
    await Notification.insertMany(
      admins.map(a => ({
        user:    a._id,
        type:    'FEEDBACK_SUBMITTED',
        message: `New feedback ${feedbackNumber} submitted for "${projectName}" by ${submitterName}`,
      })),
      { ordered: false }
    );
  } catch (err: any) {
    console.warn('[Feedback] notifyAdmins failed (non-blocking):', err.message);
  }
}

// ── POST /api/feedback ─────────────────────────────────────────────────────────

export const submitFeedback = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const { projectId, engineerId, period, ratings, comment, suggestion, tags, isAnonymous } = req.body;

    if (!projectId || !period || !ratings) {
      res.status(400).json({ message: 'projectId, period, and ratings are required' });
      return;
    }

    const ratingFields = ['communication', 'delivery', 'quality', 'support', 'professionalism', 'overall'];
    for (const f of ratingFields) {
      const v = Number(ratings[f]);
      if (isNaN(v) || v < 1 || v > 5) {
        res.status(400).json({ message: `ratings.${f} must be between 1 and 5` });
        return;
      }
    }

    // Fetch project and validate access
    const project = await Project.findById(projectId)
      .select('name engineers')
      .lean<{ name: string; engineers: { engineer: mongoose.Types.ObjectId }[] }>();

    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    if (user.role === 'ENGINEER') {
      const onProject = project.engineers?.some(
        (e: any) => String(e.engineer?._id ?? e.engineer) === user.id
      );
      if (!onProject) {
        res.status(403).json({ message: 'You are not assigned to this project' });
        return;
      }
    }

    // Duplicate guard — one submission per user+project+period
    const existing = await Feedback.findOne({
      submittedBy: user.id,
      project:     projectId,
      period:      String(period).trim(),
    }).lean();

    if (existing) {
      res.status(409).json({
        message:  `You already submitted feedback for "${project.name}" in ${period}`,
        existing: { _id: existing._id, feedbackNumber: existing.feedbackNumber, status: existing.status },
      });
      return;
    }

    const anonymous  = Boolean(isAnonymous);
    const submitterN = anonymous ? 'Anonymous' : (user.name || user.email || 'Unknown');

    const feedback = await Feedback.create({
      project:        projectId,
      engineer:       engineerId || undefined,
      submittedBy:    user.id,
      submitterName:  user.name || user.email || 'Unknown',
      submitterEmail: user.email || '',
      isAnonymous:    anonymous,
      period:         String(period).trim(),
      ratings: {
        communication:   Number(ratings.communication),
        delivery:        Number(ratings.delivery),
        quality:         Number(ratings.quality),
        support:         Number(ratings.support),
        professionalism: Number(ratings.professionalism),
        overall:         Number(ratings.overall),
      },
      comment:    comment    ? String(comment).trim()    : undefined,
      suggestion: suggestion ? String(suggestion).trim() : undefined,
      tags:       Array.isArray(tags) ? tags.map(String) : [],
    });

    // Bust stats cache
    cacheDel(CACHE_KEY_STATS).catch(() => {});

    // Notify admins (fire-and-forget)
    notifyAdmins(project.name, submitterN, feedback.feedbackNumber);

    auditLogger({
      req,
      action:      'FEEDBACK_SUBMITTED',
      module:      'FEEDBACK',
      severity:    'LOW',
      entityId:    String(feedback._id),
      entityLabel: feedback.feedbackNumber,
      newValues:   { projectId, period, overall: ratings.overall, sentiment: feedback.sentiment },
    });

    res.status(201).json({ feedback });
  } catch (err: any) {
    if (err.code === 11000) {
      res.status(409).json({ message: 'Feedback already submitted for this project and period' });
      return;
    }
    res.status(500).json({ message: err.message });
  }
};

// ── GET /api/feedback ──────────────────────────────────────────────────────────

export const listFeedback = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const cursor = req.query.cursor as string | undefined;

    const filter: Record<string, unknown> = {};

    const status          = req.query.status          as string | undefined;
    const projectId       = req.query.projectId       as string | undefined;
    const period          = req.query.period          as string | undefined;
    const search          = req.query.search          as string | undefined;
    const sentiment       = req.query.sentiment       as string | undefined;
    const followUp        = req.query.followUpRequired as string | undefined;
    const from            = req.query.from            as string | undefined;
    const to              = req.query.to              as string | undefined;

    if (status    && ['PENDING','SUBMITTED','REVIEWED','RESOLVED'].includes(status))
      filter.status = status;
    if (sentiment && ['POSITIVE','NEUTRAL','NEGATIVE'].includes(sentiment))
      filter.sentiment = sentiment;
    if (followUp === 'true')
      filter.followUpRequired = true;
    if (projectId && mongoose.Types.ObjectId.isValid(projectId))
      filter.project = new mongoose.Types.ObjectId(projectId);
    if (period)
      filter.period = { $regex: escapeRegex(String(period).slice(0, 50)), $options: 'i' };

    if (from || to) {
      const dateFilter: Record<string, Date> = {};
      if (from) { const d = new Date(from); if (!isNaN(d.getTime())) dateFilter.$gte = d; }
      if (to)   { const d = new Date(to);   if (!isNaN(d.getTime())) dateFilter.$lte = d; }
      if (Object.keys(dateFilter).length) filter.createdAt = dateFilter;
    }

    if (search) {
      const safe = escapeRegex(String(search).slice(0, 100));
      filter.$and = [{ $or: [
        { feedbackNumber: { $regex: safe, $options: 'i' } },
        { submitterName:  { $regex: safe, $options: 'i' } },
        { submitterEmail: { $regex: safe, $options: 'i' } },
      ]}];
    }

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        const cc = { $or: [
          { createdAt: { $lt: new Date(decoded.ts) } },
          { createdAt: new Date(decoded.ts), _id: { $lt: new mongoose.Types.ObjectId(decoded.id) } },
        ]};
        if (filter.$and) (filter.$and as unknown[]).push(cc);
        else             filter.$and = [cc];
      }
    }

    const docs = await Feedback.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .populate('project',     'name code')
      .populate('engineer',    'name email')
      .populate('submittedBy', 'name email')
      .populate('reviewedBy',  'name email')
      .lean();

    const hasMore    = docs.length > limit;
    const items      = docs.slice(0, limit);
    const nextCursor = hasMore && items.length > 0
      ? encodeCursor(String(items[items.length - 1]._id), items[items.length - 1].createdAt as Date)
      : null;

    res.json({ items, hasMore, nextCursor });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET /api/feedback/my ───────────────────────────────────────────────────────

export const getMyFeedback = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const cursor = req.query.cursor as string | undefined;

    const filter: Record<string, unknown> = {
      submittedBy: new mongoose.Types.ObjectId(userId),
    };

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        filter.$and = [{ $or: [
          { createdAt: { $lt: new Date(decoded.ts) } },
          { createdAt: new Date(decoded.ts), _id: { $lt: new mongoose.Types.ObjectId(decoded.id) } },
        ]}];
      }
    }

    const docs = await Feedback.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .populate('project', 'name code')
      .lean();

    const hasMore    = docs.length > limit;
    const items      = docs.slice(0, limit);
    const nextCursor = hasMore && items.length > 0
      ? encodeCursor(String(items[items.length - 1]._id), items[items.length - 1].createdAt as Date)
      : null;

    // Summary stats alongside the list
    const [totals] = await Feedback.aggregate([
      { $match: { submittedBy: new mongoose.Types.ObjectId(userId) } },
      { $group: {
        _id:       null,
        total:     { $sum: 1 },
        avgOverall:{ $avg: '$ratings.overall' },
        pending:   { $sum: { $cond: [{ $eq: ['$status', 'SUBMITTED'] }, 1, 0] } },
        resolved:  { $sum: { $cond: [{ $eq: ['$status', 'RESOLVED'] }, 1, 0] } },
      }},
    ]);

    res.json({ items, hasMore, nextCursor, summary: totals ?? { total: 0, avgOverall: 0, pending: 0, resolved: 0 } });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET /api/feedback/received — engineer's received feedback ──────────────────

export const getReceivedFeedback = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const engineerId = req.user!.id;
    const limit      = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const cursor     = req.query.cursor as string | undefined;

    const filter: Record<string, unknown> = {
      engineer: new mongoose.Types.ObjectId(engineerId),
    };

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        filter.$and = [{ $or: [
          { createdAt: { $lt: new Date(decoded.ts) } },
          { createdAt: new Date(decoded.ts), _id: { $lt: new mongoose.Types.ObjectId(decoded.id) } },
        ]}];
      }
    }

    const docs = await Feedback.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .populate('project',     'name code')
      .populate('submittedBy', 'name email')
      .lean();

    const hasMore    = docs.length > limit;
    const items      = docs.slice(0, limit);
    // Mask submitter if anonymous
    const masked = items.map(fb => ({
      ...fb,
      submitterName:  fb.isAnonymous ? 'Anonymous' : fb.submitterName,
      submitterEmail: fb.isAnonymous ? '—'         : fb.submitterEmail,
    }));

    const nextCursor = hasMore && items.length > 0
      ? encodeCursor(String(items[items.length - 1]._id), items[items.length - 1].createdAt as Date)
      : null;

    res.json({ items: masked, hasMore, nextCursor });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET /api/feedback/stats ────────────────────────────────────────────────────

export const getFeedbackStats = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const cached = await cacheGet<object>(CACHE_KEY_STATS);
    if (cached) { res.json({ stats: cached }); return; }

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const [overall, trend, distribution, byStatus, topProjects, npsData, sentimentDist, followUpCount] = await Promise.all([
      // 1. Averages per rating category
      Feedback.aggregate([
        { $group: {
          _id: null,
          avgCommunication:   { $avg: '$ratings.communication' },
          avgDelivery:        { $avg: '$ratings.delivery' },
          avgQuality:         { $avg: '$ratings.quality' },
          avgSupport:         { $avg: '$ratings.support' },
          avgProfessionalism: { $avg: '$ratings.professionalism' },
          avgOverall:         { $avg: '$ratings.overall' },
          total:              { $sum: 1 },
        }},
      ]),

      // 2. Monthly trend (last 6 months)
      Feedback.aggregate([
        { $match: { createdAt: { $gte: sixMonthsAgo } } },
        { $group: {
          _id:        { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          count:      { $sum: 1 },
          avgOverall: { $avg: '$ratings.overall' },
        }},
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),

      // 3. Rating distribution (1-5 buckets)
      Feedback.aggregate([
        { $group: { _id: { $toInt: { $round: ['$ratings.overall', 0] } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),

      // 4. Count by status
      Feedback.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      // 5. Top 5 projects
      Feedback.aggregate([
        { $group: { _id: '$project', count: { $sum: 1 }, avgOverall: { $avg: '$ratings.overall' } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'projects', localField: '_id', foreignField: '_id', as: 'proj' } },
        { $unwind: { path: '$proj', preserveNullAndEmptyArrays: true } },
        { $project: { projectName: { $ifNull: ['$proj.name', 'Unknown'] }, count: 1, avgOverall: 1 } },
      ]),

      // 6. NPS — promoters (5), passives (4), detractors (1–3) on 5-point scale
      Feedback.aggregate([
        { $group: {
          _id:        null,
          promoters:  { $sum: { $cond: [{ $eq: ['$ratings.overall', 5] }, 1, 0] } },
          passives:   { $sum: { $cond: [{ $eq: ['$ratings.overall', 4] }, 1, 0] } },
          detractors: { $sum: { $cond: [{ $lte: ['$ratings.overall', 3] }, 1, 0] } },
          total:      { $sum: 1 },
        }},
        { $project: {
          promoters: 1, passives: 1, detractors: 1, total: 1,
          nps: { $cond: [
            { $eq: ['$total', 0] }, 0,
            { $multiply: [
              { $divide: [{ $subtract: ['$promoters', '$detractors'] }, '$total'] },
              100,
            ]},
          ]},
        }},
      ]),

      // 7. Sentiment distribution
      Feedback.aggregate([
        { $group: { _id: '$sentiment', count: { $sum: 1 } } },
      ]),

      // 8. Follow-up count (parallel with aggregations)
      Feedback.countDocuments({ followUpRequired: true, status: { $ne: 'RESOLVED' } }),
    ]);

    const statusMap: Record<string, number>    = {};
    for (const s of byStatus) statusMap[s._id] = s.count;

    const sentMap: Record<string, number> = {};
    for (const s of sentimentDist) sentMap[s._id] = s.count;

    const stats = {
      total:      overall[0]?.total       ?? 0,
      avgRatings: overall[0]             ?? {},
      trend,
      distribution,
      byStatus:   statusMap,
      topProjects,
      nps:        npsData[0] ?? { nps: 0, promoters: 0, passives: 0, detractors: 0, total: 0 },
      sentiment:  sentMap,
      followUpCount,
    };

    await cacheSet(CACHE_KEY_STATS, stats, CACHE_TTL_STATS);
    res.json({ stats });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET /api/feedback/project/:projectId ───────────────────────────────────────

export const getProjectFeedback = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
    const skip  = (page - 1) * limit;

    const projectFilter = { project: new mongoose.Types.ObjectId(req.params.projectId) };

    const [items, total] = await Promise.all([
      Feedback.find(projectFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('engineer',    'name email')
        .populate('submittedBy', 'name email')
        .lean(),
      Feedback.countDocuments(projectFilter),
    ]);

    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET /api/feedback/:id ──────────────────────────────────────────────────────

export const getFeedback = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const fb = await Feedback.findById(req.params.id)
      .populate('project',     'name code clientName')
      .populate('engineer',    'name email')
      .populate('submittedBy', 'name email')
      .populate('reviewedBy',  'name email')
      .lean();

    if (!fb) { res.status(404).json({ message: 'Feedback not found' }); return; }

    const submittedById = String((fb.submittedBy as any)?._id ?? fb.submittedBy);
    const engineerId    = String((fb.engineer    as any)?._id ?? fb.engineer ?? '');
    const userId        = req.user!.id;

    if (req.user?.role !== 'ADMIN' && submittedById !== userId && engineerId !== userId) {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }

    // Mask anonymous submitter for non-admin
    if (fb.isAnonymous && req.user?.role !== 'ADMIN') {
      (fb as any).submitterName  = 'Anonymous';
      (fb as any).submitterEmail = '—';
    }

    res.json({ feedback: fb });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// ── PATCH /api/feedback/:id/status ────────────────────────────────────────────

export const updateFeedbackStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status } = req.body;
    if (!['PENDING','SUBMITTED','REVIEWED','RESOLVED'].includes(status)) {
      res.status(400).json({ message: 'Invalid status' }); return;
    }
    const update: Record<string, unknown> = { status };
    if (status === 'RESOLVED') update.resolvedAt = new Date();

    const fb = await Feedback.findByIdAndUpdate(req.params.id, update, { new: true }).lean();
    if (!fb) { res.status(404).json({ message: 'Feedback not found' }); return; }

    cacheDel(CACHE_KEY_STATS).catch(() => {});
    auditLogger({ req, action: 'FEEDBACK_STATUS_UPDATED', module: 'FEEDBACK', severity: 'LOW',
      entityId: String(fb._id), entityLabel: fb.feedbackNumber, newValues: { status } });

    res.json({ feedback: fb });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// ── PATCH /api/feedback/:id/review ────────────────────────────────────────────

export const reviewFeedback = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { reviewNote, status } = req.body;
    const resolvedStatus = status || 'REVIEWED';
    const update: Record<string, unknown> = {
      reviewedBy: req.user!.id,
      status:     resolvedStatus,
    };
    if (reviewNote)                      update.reviewNote = String(reviewNote).trim();
    if (resolvedStatus === 'RESOLVED')   update.resolvedAt = new Date();

    const fb = await Feedback.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('project', 'name')
      .lean();
    if (!fb) { res.status(404).json({ message: 'Feedback not found' }); return; }

    cacheDel(CACHE_KEY_STATS).catch(() => {});
    auditLogger({ req, action: 'FEEDBACK_REVIEWED', module: 'FEEDBACK', severity: 'MEDIUM',
      entityId: String(fb._id), entityLabel: fb.feedbackNumber,
      newValues: { status: resolvedStatus, reviewNote } });

    res.json({ feedback: fb });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// ── PATCH /api/feedback/:id/follow-up ─────────────────────────────────────────

export const toggleFollowUp = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const fb = await Feedback.findById(req.params.id).lean();
    if (!fb) { res.status(404).json({ message: 'Feedback not found' }); return; }

    const updated = await Feedback.findByIdAndUpdate(
      req.params.id,
      { followUpRequired: !fb.followUpRequired },
      { new: true }
    ).lean();

    res.json({ feedback: updated });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// ── PATCH /api/feedback/bulk-status ───────────────────────────────────────────

export const bulkUpdateStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { ids, status } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ message: 'ids array required' }); return;
    }
    if (!['PENDING','SUBMITTED','REVIEWED','RESOLVED'].includes(status)) {
      res.status(400).json({ message: 'Invalid status' }); return;
    }

    const update: Record<string, unknown> = { status };
    if (status === 'RESOLVED') update.resolvedAt = new Date();

    const objectIds = ids
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));

    const result = await Feedback.updateMany(
      { _id: { $in: objectIds } },
      { $set: update }
    );

    cacheDel(CACHE_KEY_STATS).catch(() => {});
    auditLogger({ req, action: 'FEEDBACK_BULK_STATUS_UPDATED', module: 'FEEDBACK', severity: 'MEDIUM',
      metadata: { count: result.modifiedCount, status } });

    res.json({ modified: result.modifiedCount });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// ── DELETE /api/feedback/:id ───────────────────────────────────────────────────

export const deleteFeedback = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const fb = await Feedback.findByIdAndDelete(req.params.id).lean();
    if (!fb) { res.status(404).json({ message: 'Feedback not found' }); return; }

    cacheDel(CACHE_KEY_STATS).catch(() => {});
    auditLogger({ req, action: 'FEEDBACK_DELETED', module: 'FEEDBACK', severity: 'HIGH',
      entityId: String(fb._id), entityLabel: fb.feedbackNumber });

    res.json({ message: 'Deleted' });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET /api/feedback/export ───────────────────────────────────────────────────

export const exportFeedback = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const filter: Record<string, unknown> = {};
    const status    = req.query.status    as string | undefined;
    const projectId = req.query.projectId as string | undefined;
    const sentiment = req.query.sentiment as string | undefined;
    const from      = req.query.from      as string | undefined;
    const to        = req.query.to        as string | undefined;

    if (status    && ['PENDING','SUBMITTED','REVIEWED','RESOLVED'].includes(status)) filter.status = status;
    if (sentiment && ['POSITIVE','NEUTRAL','NEGATIVE'].includes(sentiment))          filter.sentiment = sentiment;
    if (projectId && mongoose.Types.ObjectId.isValid(projectId))
      filter.project = new mongoose.Types.ObjectId(projectId);
    if (from || to) {
      const df: Record<string, Date> = {};
      if (from) { const d = new Date(from); if (!isNaN(d.getTime())) df.$gte = d; }
      if (to)   { const d = new Date(to);   if (!isNaN(d.getTime())) df.$lte = d; }
      if (Object.keys(df).length) filter.createdAt = df;
    }

    const EXPORT_LIMIT = 5000;
    const items = await Feedback.find(filter)
      .sort({ createdAt: -1 })
      .limit(EXPORT_LIMIT)
      .select('feedbackNumber project engineer submittedBy submitterName submitterEmail isAnonymous period status sentiment ratings tags comment suggestion followUpRequired createdAt')
      .populate('project',  'name code')
      .populate('engineer', 'name email')
      .lean();

    const header = [
      'Feedback #','Project','Code','Submitter','Email','Anonymous',
      'Period','Status','Sentiment',
      'Communication','Delivery','Quality','Support','Professionalism','Overall',
      'Tags','Comment','Suggestion','Follow-Up','Submitted At',
    ].join(',');

    const rows = items.map(fb => {
      const proj = fb.project as any;
      return [
        fb.feedbackNumber,
        `"${(proj?.name ?? '').replace(/"/g, '""')}"`,
        proj?.code ?? '',
        `"${(fb.isAnonymous ? 'Anonymous' : fb.submitterName).replace(/"/g, '""')}"`,
        fb.isAnonymous ? '—' : fb.submitterEmail,
        fb.isAnonymous ? 'Yes' : 'No',
        fb.period,
        fb.status,
        fb.sentiment,
        fb.ratings.communication,
        fb.ratings.delivery,
        fb.ratings.quality,
        fb.ratings.support,
        fb.ratings.professionalism,
        fb.ratings.overall,
        `"${fb.tags.join('; ')}"`,
        `"${(fb.comment    ?? '').replace(/"/g, '""')}"`,
        `"${(fb.suggestion ?? '').replace(/"/g, '""')}"`,
        fb.followUpRequired ? 'Yes' : 'No',
        new Date(fb.createdAt).toISOString().slice(0, 10),
      ].join(',');
    });

    const csv = [header, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="feedback-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};
