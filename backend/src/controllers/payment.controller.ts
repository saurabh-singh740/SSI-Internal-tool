import { Response } from 'express';
import mongoose from 'mongoose';
import Payment, { PaymentStatus } from '../models/Payment';
import PaymentAuditLog, { IAuditChange } from '../models/PaymentAuditLog';
import Project from '../models/Project';
import Notification from '../models/Notification';
import { AuthRequest } from '../middleware/auth.middleware';
import { safeError } from '../utils/apiError';
import { cacheGet, cacheSet, cacheDel } from '../utils/cache';
import { auditLogger } from '../utils/auditLogger';

const CACHE_KEY_PAYMENT_SUMMARY = 'stats:payments';
const CACHE_TTL_SUMMARY = 60; // seconds

// ─── Helpers ─────────────────────────────────────────────────────────────────

function diffPayment(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  tracked: string[]
): IAuditChange[] {
  const changes: IAuditChange[] = [];
  for (const field of tracked) {
    const oldVal = before[field];
    const newVal = after[field];
    if (String(oldVal) !== String(newVal)) {
      changes.push({ field, oldValue: oldVal, newValue: newVal });
    }
  }
  return changes;
}

const TRACKED_FIELDS = [
  'invoiceNumber', 'invoiceMonth', 'paymentDate', 'grossAmount',
  'tdsAmount', 'netAmount', 'currency', 'paidToAccount',
  'referenceUTR', 'notes', 'status',
];

// ─── GET /api/payments ────────────────────────────────────────────────────────
// Admin: all payments (paginated, filterable).
// Customer: only payments for projects where canViewPayments === true.
// Engineer: 403.
export const getPayments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role === 'ENGINEER') {
      res.status(403).json({ message: 'Engineers cannot view financial records' });
      return;
    }

    const { projectId, status, page: pageQ, limit: limitQ } = req.query;
    const page  = Math.max(1, parseInt(pageQ  as string) || 1);
    const limit = Math.min(100, parseInt(limitQ as string) || 50);
    const skip  = (page - 1) * limit;

    const VALID_STATUSES: string[] = ['pending', 'received', 'overdue', 'partial'];
    const filter: Record<string, unknown> = {};
    if (projectId && mongoose.Types.ObjectId.isValid(String(projectId))) {
      filter.projectId = projectId;
    }
    if (status && VALID_STATUSES.includes(String(status))) {
      filter.status = status;
    }

    // CUSTOMER scope: restrict to projects where payment visibility is enabled.
    // Without this check, a customer could enumerate ALL payments by omitting
    // the projectId filter.
    if (req.user?.role === 'CUSTOMER') {
      const accessibleProjects = await Project
        .find({ canViewPayments: true })
        .select('_id')
        .lean();
      const accessibleIds = accessibleProjects.map((p: any) => p._id);
      // Intersect with any explicitly requested projectId
      if (filter.projectId) {
        const requested = String(filter.projectId);
        const isAllowed = accessibleIds.some((id: any) => String(id) === requested);
        if (!isAllowed) {
          res.status(403).json({ message: 'Payment access not enabled for this project' });
          return;
        }
      } else {
        filter.projectId = { $in: accessibleIds };
      }
    }

    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .populate('projectId', 'name code clientName currency')
        .populate('createdBy', 'name email')
        .sort({ paymentDate: -1 })
        .skip(skip)
        .limit(limit),
      Payment.countDocuments(filter),
    ]);

    res.json({ payments, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('[Payment] getPayments:', err);
    res.status(500).json({ message: 'Server error', ...safeError(err) });
  }
};

// ─── GET /api/payments/summary ────────────────────────────────────────────────
// Admin-only aggregate metrics for the dashboard.
export const getPaymentSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }

    // Serve from cache when available (60-second TTL)
    const cached = await cacheGet<{ summary: object }>(CACHE_KEY_PAYMENT_SUMMARY);
    if (cached) { res.json(cached); return; }

    const thirty = new Date();
    thirty.setDate(thirty.getDate() - 30);

    // Single round-trip: $facet runs all four pipelines in one aggregation pass
    const [result] = await Payment.aggregate([
      {
        $facet: {
          totalRevenue: [
            { $match: { status: 'received' } },
            { $group: { _id: null, v: { $sum: '$netAmount' } } },
          ],
          last30: [
            { $match: { status: 'received', paymentDate: { $gte: thirty } } },
            { $group: { _id: null, total: { $sum: '$netAmount' }, count: { $sum: 1 } } },
          ],
          overdue: [
            { $match: { status: 'overdue' } },
            { $count: 'count' },
          ],
          pending: [
            { $match: { status: 'pending' } },
            { $group: { _id: null, total: { $sum: '$grossAmount' }, count: { $sum: 1 } } },
          ],
        },
      },
    ]);

    const payload = {
      summary: {
        totalRevenue:      result.totalRevenue[0]?.v     ?? 0,
        last30DaysRevenue: result.last30[0]?.total       ?? 0,
        last30DaysCount:   result.last30[0]?.count       ?? 0,
        overdueCount:      result.overdue[0]?.count      ?? 0,
        pendingAmount:     result.pending[0]?.total      ?? 0,
        pendingCount:      result.pending[0]?.count      ?? 0,
      },
    };

    void cacheSet(CACHE_KEY_PAYMENT_SUMMARY, payload, CACHE_TTL_SUMMARY);
    res.json(payload);
  } catch (err) {
    console.error('[Payment] getPaymentSummary:', err);
    res.status(500).json({ message: 'Server error', ...safeError(err) });
  }
};

// ─── GET /api/payments/project/:projectId ────────────────────────────────────
export const getProjectPayments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role === 'ENGINEER') {
      res.status(403).json({ message: 'Engineers cannot view financial records' });
      return;
    }

    const { projectId } = req.params;

    // Customers: verify they are the billing contact for this project
    if (req.user?.role === 'CUSTOMER') {
      const project = await Project.findById(projectId);
      if (!project) { res.status(404).json({ message: 'Project not found' }); return; }
      if (!project.canViewPayments) {
        res.status(403).json({ message: 'Payment access not enabled for this project' });
        return;
      }
    }

    const payments = await Payment.find({ projectId })
      .populate('createdBy', 'name email')
      .sort({ paymentDate: -1 });

    res.json({ payments });
  } catch (err) {
    console.error('[Payment] getProjectPayments:', err);
    res.status(500).json({ message: 'Server error', ...safeError(err) });
  }
};

// ─── GET /api/payments/:id ────────────────────────────────────────────────────
export const getPaymentById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role === 'ENGINEER') {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }

    const payment = await Payment.findById(req.params.id)
      .populate('projectId', 'name code clientName currency canViewPayments')
      .populate('createdBy', 'name email');

    if (!payment) { res.status(404).json({ message: 'Payment not found' }); return; }

    if (req.user?.role === 'CUSTOMER') {
      const project = payment.projectId as any;
      if (!project?.canViewPayments) {
        res.status(403).json({ message: 'Payment access not enabled for this project' });
        return;
      }
    }

    res.json({ payment });
  } catch (err) {
    console.error('[Payment] getPaymentById:', err);
    res.status(500).json({ message: 'Server error', ...safeError(err) });
  }
};

// ─── GET /api/payments/my ─────────────────────────────────────────────────────
// Engineer-only: returns payments for all projects the calling engineer is
// assigned to.  Payments are stored per-project (not per-engineer), so we first
// resolve which projects belong to this engineer, then query those project IDs.
export const getMyPayments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Find every project this engineer appears in (uses the 'engineers.engineer' index)
    const myProjects = await Project.find(
      { 'engineers.engineer': req.user!.id },
      { _id: 1 }
    ).lean();

    if (myProjects.length === 0) {
      res.json({ payments: [] });
      return;
    }

    const projectIds = myProjects.map((p: any) => p._id);

    const payments = await Payment.find({ projectId: { $in: projectIds } })
      .populate('projectId', 'name code clientName currency')
      .sort({ paymentDate: -1 })
      .limit(20);

    res.json({ payments });
  } catch (err) {
    console.error('[Payment] getMyPayments:', err);
    res.status(500).json({ message: 'Server error', ...safeError(err) });
  }
};

// ─── POST /api/payments ───────────────────────────────────────────────────────
export const createPayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      projectId, invoiceNumber, invoiceMonth, billingPeriodStart, billingPeriodEnd,
      paymentDate, grossAmount, tdsAmount, currency, paidToAccount,
      referenceUTR, notes, status,
    } = req.body;

    if (!projectId || !invoiceMonth || !paymentDate || grossAmount === undefined) {
      res.status(400).json({ message: 'projectId, invoiceMonth, paymentDate, and grossAmount are required' });
      return;
    }
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      res.status(400).json({ message: 'Invalid projectId' });
      return;
    }

    const project = await Project.findById(projectId);
    if (!project) { res.status(404).json({ message: 'Project not found' }); return; }

    const gross = Number(grossAmount);
    const tds   = Number(tdsAmount ?? 0);
    if (isNaN(gross) || gross < 0) {
      res.status(400).json({ message: 'grossAmount must be a non-negative number' });
      return;
    }
    if (isNaN(tds) || tds < 0 || tds > gross) {
      res.status(400).json({ message: 'tdsAmount must be between 0 and grossAmount' });
      return;
    }

    const VALID_STATUSES: PaymentStatus[] = ['pending', 'received', 'overdue', 'partial'];
    const resolvedStatus: PaymentStatus = VALID_STATUSES.includes(status) ? status : 'pending';

    const payment = await Payment.create({
      projectId, invoiceNumber, invoiceMonth, billingPeriodStart, billingPeriodEnd,
      paymentDate, grossAmount: gross, tdsAmount: tds,
      currency: currency || project.currency || 'USD',
      paidToAccount, referenceUTR, notes,
      status: resolvedStatus,
      createdBy: req.user!.id,
    });

    // Audit log — creation
    await PaymentAuditLog.create({
      paymentId: payment._id,
      projectId: payment.projectId,
      action:    'created',
      changedBy: req.user!.id,
      changedAt: new Date(),
      changes:   [],
      snapshot:  payment.toObject(),
    });

    const populated = await Payment.findById(payment._id)
      .populate('projectId', 'name code clientName currency')
      .populate('createdBy', 'name email');

    auditLogger({
      req,
      action:      'PAYMENT_CREATED',
      module:      'PAYMENTS',
      entityId:    String(payment._id),
      entityLabel: payment.invoiceNumber || payment.invoiceMonth,
      newValues:   { projectId, invoiceMonth: payment.invoiceMonth, grossAmount: payment.grossAmount, status: payment.status },
    });

    void cacheDel(CACHE_KEY_PAYMENT_SUMMARY);
    res.status(201).json({ message: 'Payment created', payment: populated });
  } catch (err) {
    console.error('[Payment] createPayment:', err);
    res.status(500).json({ message: 'Server error', ...safeError(err) });
  }
};

// ─── PATCH /api/payments/:id ──────────────────────────────────────────────────
export const updatePayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) { res.status(404).json({ message: 'Payment not found' }); return; }

    const before = payment.toObject() as unknown as Record<string, unknown>;

    // Allowlist fields for update
    const allowed: (keyof typeof req.body)[] = [
      'invoiceNumber', 'invoiceMonth', 'billingPeriodStart', 'billingPeriodEnd',
      'paymentDate', 'grossAmount', 'tdsAmount', 'currency',
      'paidToAccount', 'referenceUTR', 'notes', 'status',
    ];

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        (payment as any)[field] = req.body[field];
      }
    }

    // Re-validate numeric bounds
    const gross = Number(payment.grossAmount);
    const tds   = Number(payment.tdsAmount);
    if (tds > gross) {
      res.status(400).json({ message: 'tdsAmount cannot exceed grossAmount' });
      return;
    }

    await payment.save(); // triggers pre-save netAmount recalc

    const after   = payment.toObject() as unknown as Record<string, unknown>;
    const changes = diffPayment(before, after, TRACKED_FIELDS);

    if (changes.length > 0) {
      await PaymentAuditLog.create({
        paymentId: payment._id,
        projectId: payment.projectId,
        action:    'updated',
        changedBy: req.user!.id,
        changedAt: new Date(),
        changes,
        snapshot:  after,
      });
    }

    const populated = await Payment.findById(payment._id)
      .populate('projectId', 'name code clientName currency')
      .populate('createdBy', 'name email');

    if (changes.length > 0) {
      auditLogger({
        req,
        action:      'PAYMENT_UPDATED',
        module:      'PAYMENTS',
        entityId:    String(payment._id),
        entityLabel: payment.invoiceNumber || payment.invoiceMonth,
      });
    }

    void cacheDel(CACHE_KEY_PAYMENT_SUMMARY);
    res.json({ message: 'Payment updated', payment: populated });
  } catch (err) {
    console.error('[Payment] updatePayment:', err);
    res.status(500).json({ message: 'Server error', ...safeError(err) });
  }
};

// ─── DELETE /api/payments/:id ─────────────────────────────────────────────────
export const deletePayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) { res.status(404).json({ message: 'Payment not found' }); return; }

    // Audit log — deletion (before removing)
    await PaymentAuditLog.create({
      paymentId: payment._id,
      projectId: payment.projectId,
      action:    'deleted',
      changedBy: req.user!.id,
      changedAt: new Date(),
      changes:   [],
      snapshot:  payment.toObject(),
    });

    auditLogger({
      req,
      action:      'PAYMENT_DELETED',
      module:      'PAYMENTS',
      entityId:    String(payment._id),
      entityLabel: payment.invoiceNumber || payment.invoiceMonth,
      oldValues:   { invoiceMonth: payment.invoiceMonth, grossAmount: payment.grossAmount, status: payment.status },
    });

    await payment.deleteOne();
    void cacheDel(CACHE_KEY_PAYMENT_SUMMARY);
    res.json({ message: 'Payment deleted' });
  } catch (err) {
    console.error('[Payment] deletePayment:', err);
    res.status(500).json({ message: 'Server error', ...safeError(err) });
  }
};

// ─── GET /api/payments/:id/audit ─────────────────────────────────────────────
export const getPaymentAuditLog = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const logs = await PaymentAuditLog.find({ paymentId: req.params.id })
      .populate('changedBy', 'name email')
      .sort({ changedAt: -1 })
      .limit(100);

    res.json({ logs });
  } catch (err) {
    console.error('[Payment] getPaymentAuditLog:', err);
    res.status(500).json({ message: 'Server error', ...safeError(err) });
  }
};

// ─── Internal: mark overdue + send notifications ──────────────────────────────
// Called by the daily scheduler — not an HTTP handler.
export async function runOverdueCheck(): Promise<{ marked: number; notified: number }> {
  const now     = new Date();
  const in3Days = new Date(now); in3Days.setDate(in3Days.getDate() + 3);
  const in7Days = new Date(now); in7Days.setDate(in7Days.getDate() + 7);

  let marked   = 0;
  let notified = 0;

  // 1. Mark overdue: paymentDate has passed and status is still pending/partial
  const overdueResult = await Payment.updateMany(
    {
      status:      { $in: ['pending', 'partial'] },
      paymentDate: { $lt: now },
    },
    { $set: { status: 'overdue' } }
  );
  marked = overdueResult.modifiedCount;

  if (marked > 0) {
    console.log(`[PaymentScheduler] Marked ${marked} payment(s) as overdue`);
  }

  // 2. In-app notifications for overdue payments (one notification per unique project-admin)
  const overduePayments = await Payment.find({ status: 'overdue' })
    .populate<{ projectId: { _id: mongoose.Types.ObjectId; name: string; createdBy: mongoose.Types.ObjectId } }>(
      'projectId', 'name createdBy'
    );

  for (const p of overduePayments) {
    const project = p.projectId as any;
    if (!project?.createdBy) continue;

    const existingNotif = await Notification.findOne({
      user:    project.createdBy,
      project: project._id,
      type:    'PAYMENT_RECORDED',
      message: { $regex: `overdue.*${p._id}`, $options: 'i' },
      read:    false,
    });

    if (!existingNotif) {
      await Notification.create({
        user:    project.createdBy,
        project: project._id,
        type:    'PAYMENT_RECORDED',
        message: `Payment for ${p.invoiceMonth} (${project.name}) is overdue.`,
      });
      notified++;
    }
  }

  // 3. 3-day reminder notifications — batch writes instead of per-document awaits
  const due3 = await Payment.find({
    status:        { $in: ['pending', 'partial'] },
    paymentDate:   { $gte: now, $lte: in3Days },
    reminderSent3: false,
  }).populate<{ projectId: any }>('projectId', 'name createdBy');

  const notifs3 = due3
    .filter(p => (p.projectId as any)?.createdBy)
    .map(p => {
      const project = p.projectId as any;
      return {
        user:    project.createdBy,
        project: project._id,
        type:    'PAYMENT_RECORDED' as const,
        message: `Payment for ${p.invoiceMonth} (${project.name}) is due in 3 days.`,
      };
    });

  if (notifs3.length) {
    await Notification.insertMany(notifs3);
    notified += notifs3.length;
  }
  // Mark all at once
  const due3Ids = due3.map(p => p._id);
  if (due3Ids.length) {
    await Payment.updateMany({ _id: { $in: due3Ids } }, { $set: { reminderSent3: true } });
  }

  // 4. 7-day reminder notifications — batch writes
  const due7 = await Payment.find({
    status:        { $in: ['pending', 'partial'] },
    paymentDate:   { $gte: in3Days, $lte: in7Days },
    reminderSent7: false,
  }).populate<{ projectId: any }>('projectId', 'name createdBy');

  const notifs7 = due7
    .filter(p => (p.projectId as any)?.createdBy)
    .map(p => {
      const project = p.projectId as any;
      return {
        user:    project.createdBy,
        project: project._id,
        type:    'PAYMENT_RECORDED' as const,
        message: `Payment for ${p.invoiceMonth} (${project.name}) is due in 7 days.`,
      };
    });

  if (notifs7.length) {
    await Notification.insertMany(notifs7);
    notified += notifs7.length;
  }
  const due7Ids = due7.map(p => p._id);
  if (due7Ids.length) {
    await Payment.updateMany({ _id: { $in: due7Ids } }, { $set: { reminderSent7: true } });
  }

  return { marked, notified };
}
