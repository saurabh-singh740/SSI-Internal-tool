import { Response } from 'express';
import Notification from '../models/Notification';
import { AuthRequest } from '../middleware/auth.middleware';
import { safeError } from '../utils/apiError';

// ── GET /api/notifications ────────────────────────────────────────────────────
// Returns paginated notifications for the authenticated user.
export const getNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
    const limit = Math.min(50,  parseInt(req.query.limit as string) || 20);
    const skip  = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      Notification.find({ user: req.user!.id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('project', 'name code')
        .lean(),
      Notification.countDocuments({ user: req.user!.id }),
    ]);

    res.json({ notifications, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('[Notifications] getNotifications:', error);
    res.status(500).json({ message: 'Server error', ...safeError(error) });
  }
};

// ── GET /api/notifications/unread-count ──────────────────────────────────────
// Returns the count of unread notifications for the bell icon badge.
export const getUnreadCount = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const count = await Notification.countDocuments({ user: req.user!.id, read: false });
    res.json({ count });
  } catch (error) {
    console.error('[Notifications] getUnreadCount:', error);
    res.status(500).json({ message: 'Server error', ...safeError(error) });
  }
};

// ── PATCH /api/notifications/:id/read ────────────────────────────────────────
// Marks a single notification as read.
export const markAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user!.id }, // user scoped — no cross-user access
      { read: true },
      { new: true },
    );

    if (!notification) {
      res.status(404).json({ message: 'Notification not found' });
      return;
    }

    res.json({ notification });
  } catch (error) {
    console.error('[Notifications] markAsRead:', error);
    res.status(500).json({ message: 'Server error', ...safeError(error) });
  }
};

// ── PATCH /api/notifications/read-all ────────────────────────────────────────
// Marks ALL notifications for the user as read.
export const markAllAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await Notification.updateMany({ user: req.user!.id, read: false }, { read: true });
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('[Notifications] markAllAsRead:', error);
    res.status(500).json({ message: 'Server error', ...safeError(error) });
  }
};
