import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Project from '../models/Project';
import User from '../models/User';
import Notification from '../models/Notification';
import EngineerInvite from '../models/EngineerInvite';
import Timesheet from '../models/Timesheet';
import Payment from '../models/Payment';
import { AuthRequest } from '../middleware/auth.middleware';
import { dispatchProjectEngineers } from '../queues/dispatch';
import { filterBody } from '../utils/filterBody';
import { safeError } from '../utils/apiError';
import { cacheGet, cacheSet, cacheDel } from '../utils/cache';
import { auditLogger } from '../utils/auditLogger';
import { computeDiff } from '../utils/diffUtil';

const CACHE_KEY_PROJECT_STATS = 'stats:projects';
const CACHE_TTL_STATS = 60; // seconds

/** Escape a string so it is safe to embed in a MongoDB $regex operator. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Allowlist of fields that a client is permitted to set when creating or
 * updating a project.  Any field NOT in this list is silently dropped, which
 * prevents mass-assignment of internal fields such as hoursUsed, isNearLimit,
 * createdBy, or __v.
 */
const PROJECT_WRITABLE_FIELDS = [
  'name', 'code', 'type', 'category', 'status', 'description',
  'sourceType', 'sourceName',
  'clientName', 'clientCompany', 'clientEmail', 'clientPhone',
  'startDate', 'endDate', 'estimatedCompletionDate', 'phase',
  'contractedHours', 'additionalApprovedHours', 'hourlyRate', 'currency',
  'billingType', 'billingCycle', 'maxAllowedHours', 'alertThreshold',
  'paymentTerms', 'tdsPercentage', 'paymentMode', 'billingContactEmail',
  'clientAccessEnabled', 'canViewSummary', 'canViewTimesheets',
  'canViewPayments', 'canViewStatus',
  'engineersCanEditTimesheets', 'timesheetApprovalRequired', 'timesheetLockPeriod',
  'engineers', 'customFields', 'notes',
  // Per-engineer date range fields are nested inside engineers[] subdocs and
  // handled automatically when the engineers array is written above.

] as const;

// Strip engineer entries whose ref resolved to null after populate (deleted users)
function stripNullEngineers(project: any): void {
  if (project && Array.isArray(project.engineers)) {
    project.engineers = project.engineers.filter(
      (e: any) => e.engineer !== null && e.engineer !== undefined
    );
  }
}

// Validate that every engineer ObjectId in the array actually exists in User collection
async function validateEngineerIds(engineers: { engineer: string }[]): Promise<string | null> {
  for (const e of engineers) {
    if (!e.engineer || !mongoose.Types.ObjectId.isValid(e.engineer)) {
      return `Invalid engineer ID: ${e.engineer}`;
    }
    const exists = await User.exists({ _id: e.engineer });
    if (!exists) return `Engineer not found: ${e.engineer}`;
  }
  return null;
}

// GET /api/projects  — supports ?page, ?limit, ?status, ?type, ?search
export const getProjects = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, type, search } = req.query;
    const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const skip  = (page - 1) * limit;

    const filter: Record<string, unknown> = {};

    // Validate enum values to prevent injection via filter fields
    const VALID_STATUSES = ['ACTIVE', 'CLOSED', 'ON_HOLD'];
    const VALID_TYPES    = ['INTERNAL', 'CLIENT_PROJECT', 'SUPPORT'];
    if (status && VALID_STATUSES.includes(String(status))) filter.status = status;
    if (type   && VALID_TYPES.includes(String(type)))      filter.type   = type;

    if (search) {
      // Escape to prevent ReDoS / regex injection attacks
      const safe = escapeRegex(String(search).slice(0, 100));
      filter.$or = [
        { name:       { $regex: safe, $options: 'i' } },
        { code:       { $regex: safe, $options: 'i' } },
        { clientName: { $regex: safe, $options: 'i' } },
      ];
    }

    // Engineers only see their assigned projects
    if (req.user?.role === 'ENGINEER') {
      filter['engineers.engineer'] = req.user.id;
    }

    const [projects, total] = await Promise.all([
      Project.find(filter)
        // Exclude heavy embedded arrays — attachments can contain base64 blobs
        // (several MB each) and customFields/notes are not rendered in list views.
        // Full document is still returned by getProjectById for the detail page.
        .select('-attachments -customFields -notes -description')
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Project.countDocuments(filter),
    ]);

    res.json({ projects, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Server error', ...safeError(error) });
  }
};

// GET /api/projects/:id
export const getProjectById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('engineers.engineer', 'name email role')
      .populate('createdBy', 'name email')
      .lean({ virtuals: true }); // lean + virtuals for remainingHours/utilizationPercentage

    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    // Find stale engineer subdocs (populated ref resolved to null = deleted user)
    const staleSubdocIds = (project.engineers as any[])
      .filter((e) => e.engineer === null || e.engineer === undefined)
      .map((e) => e._id);

    // Strip nulls from response
    if (staleSubdocIds.length > 0) {
      (project as any).engineers = (project.engineers as any[]).filter(
        (e) => e.engineer !== null && e.engineer !== undefined
      );
      // Persist the cleanup asynchronously — don't block the response
      setImmediate(() => {
        Project.updateOne(
          { _id: project._id },
          { $pull: { engineers: { _id: { $in: staleSubdocIds } } } }
        ).catch((err) => console.error('[getProjectById] Stale engineer cleanup failed:', err));
      });
    }

    // Engineers can only view their assigned projects
    if (req.user?.role === 'ENGINEER') {
      const isAssigned = (project.engineers as any[]).some(
        (e) => String(e.engineer?._id ?? e.engineer) === req.user?.id
      );
      if (!isAssigned) {
        res.status(403).json({ message: 'Access denied' });
        return;
      }
    }

    res.json({ project });
  } catch (error) {
    res.status(500).json({ message: 'Server error', ...safeError(error) });
  }
};

// POST /api/projects
// ── Performance: responds in ~30ms. All engineer work runs in background. ─────
export const createProject = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // ── Mass-assignment fix: only allowlisted fields reach the DB ────────────
    // The old `...req.body` spread allowed injecting hoursUsed, isNearLimit,
    // totalAuthorizedHours, etc. directly. This strips all non-writable fields.
    const safeBody = filterBody(req.body, PROJECT_WRITABLE_FIELDS);

    if ((safeBody as any).engineers?.length) {
      const validationError = await validateEngineerIds((safeBody as any).engineers);
      if (validationError) {
        res.status(400).json({ message: validationError });
        return;
      }
    }

    const project = await Project.create({ ...safeBody, createdBy: req.user?.id });

    // ── Respond immediately — do NOT await emails or timesheet generation ─────
    // The client gets a response before any background work starts.
    // hoursUsed/isNearLimit/totalAuthorizedHours are computed by Mongoose
    // pre-save hooks so they are correct in the returned document.
    res.status(201).json({ message: 'Project created', project });

    auditLogger({
      req,
      action:      'PROJECT_CREATED',
      module:      'PROJECTS',
      entityId:    String(project._id),
      entityLabel: project.name,
      newValues:   { name: project.name, code: project.code, type: project.type, status: project.status },
    });

    // Invalidate cached stats so next dashboard load reflects the new project
    setImmediate(() => { void cacheDel(CACHE_KEY_PROJECT_STATS); });

    // ── Fire background work after response is flushed ────────────────────────
    // setImmediate guarantees the event loop has returned the response to the
    // client before we start the potentially slow background operations.
    if (project.engineers?.length) {
      const year = project.startDate
        ? new Date(project.startDate).getFullYear()
        : new Date().getFullYear();

      setImmediate(() => {
        dispatchProjectEngineers({
          projectId:            String(project._id),
          projectName:          project.name,
          clientName:           project.clientName || '',
          engineerIds:          project.engineers.map((e) => String(e.engineer)),
          year,
          totalAuthorizedHours: project.contractedHours + project.additionalApprovedHours,
        });
      });
    }
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(400).json({ message: 'Project code already exists' });
      return;
    }
    res.status(500).json({ message: error.message || 'Server error', ...safeError(error) });
  }
};

// PUT /api/projects/:id
export const updateProject = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Validate engineer IDs before saving
    if (req.body.engineers?.length) {
      const validationError = await validateEngineerIds(req.body.engineers);
      if (validationError) {
        res.status(400).json({ message: validationError });
        return;
      }
    }

    const project = await Project.findById(req.params.id);
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    // Prevent edits on closed projects (except re-opening)
    if (project.status === 'CLOSED' && req.body.status !== 'ACTIVE' && req.body.status !== 'ON_HOLD') {
      res.status(400).json({ message: 'Cannot edit a closed project' });
      return;
    }

    const wasOpen = project.status !== 'CLOSED';
    const nowClosed = req.body.status === 'CLOSED';

    // Apply ONLY allowlisted fields via filterBody — same utility used in createProject
    const safeUpdate = filterBody(req.body, PROJECT_WRITABLE_FIELDS);

    // Snapshot before mutation for diff + engineer tracking
    const beforeRaw    = project.toObject() as unknown as Record<string, unknown>;
    const oldEngIds    = new Set(
      (project.engineers as any[]).map((e: any) => String(e.engineer))
    );

    Object.assign(project, safeUpdate);
    await project.save();

    // Snapshot after mutation
    const afterRaw  = project.toObject() as unknown as Record<string, unknown>;
    const newEngIds = new Set(
      (project.engineers as any[]).map((e: any) => String(e.engineer))
    );

    // Notify on project close
    if (wasOpen && nowClosed) {
      const engineers = project.engineers.map((e) => ({
        user: e.engineer,
        project: project._id,
        type: 'PROJECT_CLOSED' as const,
        message: `Project "${project.name}" has been closed`,
      }));
      if (engineers.length) await Notification.insertMany(engineers);
    }

    // Check threshold alert
    if (project.isNearLimit) {
      const existing = await Notification.findOne({
        project: project._id,
        type: 'HOURS_THRESHOLD_EXCEEDED',
        read: false,
      });
      if (!existing) {
        await Notification.create({
          user: project.createdBy,
          project: project._id,
          type: 'HOURS_THRESHOLD_EXCEEDED',
          message: `Project "${project.name}" has exceeded ${project.alertThreshold}% of allowed hours`,
        });

        // Log the threshold breach — a dedicated alert email template should be
        // used here; re-using the engineer-assignment email would send a confusing
        // "confirm your assignment" link to the admin, so we skip the email and
        // rely on the in-app notification created above.
        console.log(`[updateProject] Hours threshold exceeded for project "${project.name}" — in-app notification sent to creator`);
      }
    }

    const populated = await Project.findById(project._id)
      .populate('engineers.engineer', 'name email role')
      .populate('createdBy', 'name email');

    // Diff non-engineer fields — only record what actually changed
    const diffableFields = (Object.keys(safeUpdate) as string[]).filter(f => f !== 'engineers');
    const { oldValues, newValues, hasChanges } = computeDiff(beforeRaw, afterRaw, diffableFields);

    auditLogger({
      req,
      action:      'PROJECT_UPDATED',
      module:      'PROJECTS',
      entityId:    String(project._id),
      entityLabel: project.name,
      oldValues:   hasChanges ? oldValues : undefined,
      newValues:   hasChanges ? newValues : undefined,
    });

    // Emit individual ENGINEER_ADDED / ENGINEER_REMOVED events
    const addedEng   = [...newEngIds].filter(id => !oldEngIds.has(id));
    const removedEng = [...oldEngIds].filter(id => !newEngIds.has(id));
    addedEng.forEach(engineerId => auditLogger({
      req,
      action:      'ENGINEER_ADDED',
      module:      'PROJECTS',
      entityId:    String(project._id),
      entityLabel: project.name,
      metadata:    { engineerId },
    }));
    removedEng.forEach(engineerId => auditLogger({
      req,
      action:      'ENGINEER_REMOVED',
      module:      'PROJECTS',
      entityId:    String(project._id),
      entityLabel: project.name,
      metadata:    { engineerId },
    }));

    void cacheDel(CACHE_KEY_PROJECT_STATS);
    res.json({ message: 'Project updated', project: populated });
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Server error', ...safeError(error) });
  }
};

// DELETE /api/projects/:id
// Cascade-deletes all dependent records to prevent orphaned data.
export const deleteProject = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    auditLogger({
      req,
      action:      'PROJECT_DELETED',
      module:      'PROJECTS',
      entityId:    String(project._id),
      entityLabel: project.name,
      oldValues:   { name: project.name, code: project.code, status: project.status },
    });

    // Cascade: remove all records tied to this project
    await Promise.all([
      Timesheet.deleteMany({ project: project._id }),
      Payment.deleteMany({ projectId: project._id }),
      Notification.deleteMany({ project: project._id }),
      EngineerInvite.deleteMany({ project: project._id }),
    ]);

    await project.deleteOne();
    void cacheDel(CACHE_KEY_PROJECT_STATS);
    res.json({ message: 'Project deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', ...safeError(error) });
  }
};

// GET /api/projects/:id/metrics
export const getProjectMetrics = async (req: Request, res: Response): Promise<void> => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      res.status(404).json({ message: 'Project not found' });
      return;
    }

    const totalAuthorizedHours = project.contractedHours + project.additionalApprovedHours;
    const remainingHours = totalAuthorizedHours - project.hoursUsed;
    const utilizationPercentage =
      totalAuthorizedHours > 0
        ? Math.round((project.hoursUsed / totalAuthorizedHours) * 10000) / 100
        : 0;

    res.json({
      metrics: {
        totalAuthorizedHours,
        hoursUsed: project.hoursUsed,
        remainingHours,
        utilizationPercentage,
        isNearLimit: project.isNearLimit,
        alertThreshold: project.alertThreshold,
        maxAllowedHours: project.maxAllowedHours,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', ...safeError(error) });
  }
};

// GET /api/projects/stats/summary
export const getProjectStats = async (_req: Request, res: Response): Promise<void> => {
  try {
    // Serve from cache when available (60-second TTL)
    const cached = await cacheGet<{ stats: object }>(CACHE_KEY_PROJECT_STATS);
    if (cached) { res.json(cached); return; }

    // Single round-trip: $facet runs all five counts in one aggregation pass
    const [result] = await Project.aggregate([
      {
        $facet: {
          total:     [{ $count: 'v' }],
          active:    [{ $match: { status: 'ACTIVE' } },                    { $count: 'v' }],
          closed:    [{ $match: { status: 'CLOSED' } },                    { $count: 'v' }],
          onHold:    [{ $match: { status: 'ON_HOLD' } },                   { $count: 'v' }],
          nearLimit: [{ $match: { status: 'ACTIVE', isNearLimit: true } }, { $count: 'v' }],
        },
      },
    ]);

    const payload = {
      stats: {
        total:     result.total[0]?.v     ?? 0,
        active:    result.active[0]?.v    ?? 0,
        closed:    result.closed[0]?.v    ?? 0,
        onHold:    result.onHold[0]?.v    ?? 0,
        nearLimit: result.nearLimit[0]?.v ?? 0,
      },
    };

    void cacheSet(CACHE_KEY_PROJECT_STATS, payload, CACHE_TTL_STATS);
    res.json(payload);
  } catch (error) {
    res.status(500).json({ message: 'Server error', ...safeError(error) });
  }
};
