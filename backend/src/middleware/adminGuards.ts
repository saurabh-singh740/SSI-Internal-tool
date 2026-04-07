/**
 * Admin account protection middleware.
 *
 * Two guards that attach to specific user routes to prevent:
 *   1. Deleting the last ADMIN → permanent system lockout
 *   2. Demoting the last ADMIN (including self-demotion) → same lockout
 *
 * These are route-level middleware, not global, so the DB query only fires
 * on the two specific operations that need it.
 */
import { Response, NextFunction } from 'express';
import User from '../models/User';
import { AuthRequest } from './auth.middleware';

// ── Guard 1: Prevent last-admin deletion ─────────────────────────────────────
// Attach to: DELETE /api/users/:id (before controller)

export const preventLastAdminDeletion = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Self-deletion guard: always reject (regardless of admin count)
    if (req.user?.id === req.params.id) {
      res.status(400).json({
        message: 'You cannot delete your own account.',
      });
      return;
    }

    // Only need the admin count check if the target IS an admin.
    // Use lean + select for a minimal, fast query.
    const target = await User.findById(req.params.id).select('role').lean();
    if (!target) { next(); return; } // 404 handled by the controller

    if (target.role === 'ADMIN') {
      // countDocuments on an indexed field is O(1) on MongoDB
      const adminCount = await User.countDocuments({ role: 'ADMIN' });
      if (adminCount <= 1) {
        res.status(400).json({
          message:
            'Cannot delete the last admin account. ' +
            'Promote another user to ADMIN first.',
        });
        return;
      }
    }

    next();
  } catch (err) {
    console.error('[adminGuards] preventLastAdminDeletion:', err);
    res.status(500).json({ message: 'Server error during admin guard check' });
  }
};

// ── Guard 2: Prevent last-admin self-demotion ─────────────────────────────────
// Attach to: PUT /api/users/:id (before controller)
//
// Scenario blocked: admin changes their own role (or another admin's role) to
// ENGINEER/CUSTOMER when no other admin exists → system becomes unrecoverable.

export const preventLastAdminDemotion = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const incomingRole = req.body?.role;

    // Only relevant if the request is trying to change the role away from ADMIN
    if (!incomingRole || incomingRole === 'ADMIN') { next(); return; }

    const target = await User.findById(req.params.id).select('role').lean();
    if (!target || target.role !== 'ADMIN') { next(); return; } // not an admin, no risk

    const adminCount = await User.countDocuments({ role: 'ADMIN' });
    if (adminCount <= 1) {
      res.status(400).json({
        message:
          'Cannot demote the last admin account. ' +
          'Promote another user to ADMIN first.',
      });
      return;
    }

    next();
  } catch (err) {
    console.error('[adminGuards] preventLastAdminDemotion:', err);
    res.status(500).json({ message: 'Server error during admin guard check' });
  }
};
