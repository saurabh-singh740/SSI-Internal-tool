/**
 * auditLog.controller.ts — Admin-only read API for the audit log viewer.
 *
 * Endpoints:
 *   GET /api/audit-logs          — paginated list (cursor-based) with filters
 *   GET /api/audit-logs/:id      — single entry detail
 *   GET /api/audit-logs/stats    — aggregate counts per module/severity
 *
 * Security:
 *   • All routes require protect + requireRole('ADMIN').
 *   • Audit logs are READ-ONLY — no write/delete endpoints exposed.
 *   • Logs are immutable at the schema level (pre-hooks block updates).
 *
 * Pagination strategy — cursor-based over (_id + createdAt):
 *   Advantages over offset (skip):
 *     • O(log n) index seek instead of O(n) skip scan — stays fast at 10M+ rows.
 *     • Stable: inserting new records doesn't shift pages.
 *     • Compound cursor (createdAt + _id) handles ties correctly.
 *
 *   Client receives `nextCursor` (opaque base64 string) in the response.
 *   Pass it as `?cursor=<value>` on the next request to get the next page.
 *   When `nextCursor` is null, you're on the last page.
 */

import { Response }        from 'express';
import mongoose            from 'mongoose';
import AuditLog, { AuditModule, AuditSeverity } from '../models/AuditLog';
import { AuthRequest }     from '../middleware/auth.middleware';
import { safeError }       from '../utils/apiError';

// ── Cursor helpers ────────────────────────────────────────────────────────────

interface CursorPayload { id: string; ts: number }

function encodeCursor(id: string, createdAt: Date): string {
  return Buffer.from(JSON.stringify({ id, ts: createdAt.getTime() })).toString('base64url');
}

function decodeCursor(cursor: string): CursorPayload | null {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as CursorPayload;
  } catch {
    return null;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Validation sets ───────────────────────────────────────────────────────────

const VALID_MODULES: AuditModule[] = [
  'AUTH','USERS','PROJECTS','DEALS','TIMESHEETS','PAYMENTS','PARTNERS','SYSTEM',
];
const VALID_SEVERITIES: AuditSeverity[] = ['LOW','MEDIUM','HIGH','CRITICAL'];

// ── GET /api/audit-logs ───────────────────────────────────────────────────────

export const getAuditLogs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const cursor = req.query.cursor as string | undefined;

    // ── Build filter ──────────────────────────────────────────────────────────
    const filter: Record<string, unknown> = {};

    // Enum filters — validated against allowlists to prevent injection
    const module   = req.query.module   as string | undefined;
    const severity = req.query.severity as string | undefined;
    if (module   && VALID_MODULES.includes(module as AuditModule))
      filter.module = module;
    if (severity && VALID_SEVERITIES.includes(severity as AuditSeverity))
      filter.severity = severity;

    // Actor filter
    const actorId = req.query.actorId as string | undefined;
    if (actorId && mongoose.Types.ObjectId.isValid(actorId))
      filter.actorId = new mongoose.Types.ObjectId(actorId);

    // Action search (partial match)
    const action = req.query.action as string | undefined;
    if (action) {
      const safe = escapeRegex(String(action).slice(0, 100));
      filter.action = { $regex: safe, $options: 'i' };
    }

    // Entity filter
    const entityId = req.query.entityId as string | undefined;
    if (entityId) filter.entityId = entityId;

    // Date range
    const from = req.query.from as string | undefined;
    const to   = req.query.to   as string | undefined;
    if (from || to) {
      const dateFilter: Record<string, Date> = {};
      if (from) { const d = new Date(from); if (!isNaN(d.getTime())) dateFilter.$gte = d; }
      if (to)   { const d = new Date(to);   if (!isNaN(d.getTime())) dateFilter.$lte = d; }
      if (Object.keys(dateFilter).length) filter.createdAt = dateFilter;
    }

    // Full-text search across action, actorEmail, actorName, entityLabel, requestId
    const search = req.query.search as string | undefined;
    if (search) {
      const safe = escapeRegex(String(search).slice(0, 100));
      const searchOr = [
        { action:      { $regex: safe, $options: 'i' } },
        { actorEmail:  { $regex: safe, $options: 'i' } },
        { actorName:   { $regex: safe, $options: 'i' } },
        { actorRole:   { $regex: safe, $options: 'i' } },
        { entityLabel: { $regex: safe, $options: 'i' } },
        { entityId:    { $regex: safe, $options: 'i' } },
        { requestId:   { $regex: safe, $options: 'i' } },
      ];
      // Merge with existing $or (e.g. from cursor) via $and
      filter.$and = [{ $or: searchOr }];
    }

    // ── Cursor condition ──────────────────────────────────────────────────────
    // Compound cursor: (createdAt < ts) OR (createdAt == ts AND _id < id)
    // This correctly handles records with identical timestamps.
    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        const cursorCondition = {
          $or: [
            { createdAt: { $lt: new Date(decoded.ts) } },
            {
              createdAt: new Date(decoded.ts),
              _id:       { $lt: new mongoose.Types.ObjectId(decoded.id) },
            },
          ],
        };
        // Merge with existing $and or create it
        if (filter.$and) {
          (filter.$and as unknown[]).push(cursorCondition);
        } else {
          filter.$and = [cursorCondition];
        }
      }
    }

    // ── Query ─────────────────────────────────────────────────────────────────
    // Fetch one extra to detect if there's a next page
    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1, _id: -1 })   // newest first; _id breaks ties
      .limit(limit + 1)
      .select('-__v')                      // strip version key
      .lean();

    const hasMore   = logs.length > limit;
    const items     = logs.slice(0, limit);
    const nextCursor = hasMore && items.length > 0
      ? encodeCursor(
          String(items[items.length - 1]._id),
          items[items.length - 1].createdAt as Date,
        )
      : null;

    res.json({ logs: items, nextCursor, hasMore, count: items.length });
  } catch (err) {
    console.error('[AuditLog] getAuditLogs:', err);
    res.status(500).json({ message: 'Server error', ...safeError(err) });
  }
};

// ── GET /api/audit-logs/stats ─────────────────────────────────────────────────

export const getAuditStats = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 30); // last 30 days

    const [result] = await AuditLog.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $facet: {
          byModule: [
            { $group: { _id: '$module', count: { $sum: 1 } } },
            { $sort:  { count: -1 } },
          ],
          bySeverity: [
            { $group: { _id: '$severity', count: { $sum: 1 } } },
          ],
          total: [
            { $count: 'v' },
          ],
          critical: [
            { $match: { severity: 'CRITICAL' } },
            { $count: 'v' },
          ],
          high: [
            { $match: { severity: 'HIGH' } },
            { $count: 'v' },
          ],
          recentByDay: [
            {
              $group: {
                _id:   { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
            { $limit: 30 },
          ],
        },
      },
    ]);

    res.json({
      stats: {
        total:      result.total[0]?.v    ?? 0,
        critical:   result.critical[0]?.v ?? 0,
        high:       result.high[0]?.v     ?? 0,
        byModule:   result.byModule,
        bySeverity: result.bySeverity,
        recentByDay: result.recentByDay,
        window:     '30d',
      },
    });
  } catch (err) {
    console.error('[AuditLog] getAuditStats:', err);
    res.status(500).json({ message: 'Server error', ...safeError(err) });
  }
};

// ── GET /api/audit-logs/:id ───────────────────────────────────────────────────

export const getAuditLogById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      res.status(400).json({ message: 'Invalid audit log ID' });
      return;
    }

    const log = await AuditLog.findById(req.params.id)
      .populate('actorId', 'name email role')
      .select('-__v')
      .lean();

    if (!log) { res.status(404).json({ message: 'Audit log not found' }); return; }

    res.json({ log });
  } catch (err) {
    console.error('[AuditLog] getAuditLogById:', err);
    res.status(500).json({ message: 'Server error', ...safeError(err) });
  }
};
