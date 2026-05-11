import { Response } from 'express';
import mongoose from 'mongoose';
import validator from 'validator';
import User from '../models/User';
import Project from '../models/Project';
import { AuthRequest } from '../middleware/auth.middleware';
import { filterBody } from '../utils/filterBody';
import { auditLogger } from '../utils/auditLogger';
import { safeError } from '../utils/apiError';
import { sendWelcomeEmail } from '../services/emailService';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Explicit allowlists — mass-assignment impossible
const USER_CREATE_FIELDS = ['name', 'email', 'password', 'role', 'phone'] as const;
const USER_UPDATE_FIELDS = ['name', 'phone'] as const; // role handled separately below

// ── POST /api/users — ADMIN only ──────────────────────────────────────────────
export const createUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = filterBody(req.body, USER_CREATE_FIELDS);
    const { name, email, password, role, phone } = body as Record<string, string>;

    if (!name || !email || !password) {
      res.status(400).json({ message: 'name, email, and password are required' });
      return;
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    if (!validator.isEmail(normalizedEmail)) {
      res.status(400).json({ message: 'Invalid email address' });
      return;
    }
    if (String(password).length < 6) {
      res.status(400).json({ message: 'Password must be at least 6 characters' });
      return;
    }

    const VALID_ROLES = ['ADMIN', 'ENGINEER', 'CUSTOMER'] as const;
    type UserRole = typeof VALID_ROLES[number];
    const userRole: UserRole = VALID_ROLES.includes(role as UserRole) ? (role as UserRole) : 'ENGINEER';

    // Only one ADMIN is allowed in the system
    if (userRole === 'ADMIN') {
      const existingAdmin = await User.exists({ role: 'ADMIN' });
      if (existingAdmin) {
        res.status(400).json({ message: 'An admin account already exists. Only one admin is allowed.' });
        return;
      }
    }

    const user = await User.create({
      name: String(name).trim().slice(0, 100),
      email: normalizedEmail,
      password,
      role: userRole,
      phone: phone ? String(phone).trim().slice(0, 30) : undefined,
    });

    auditLogger({
      req,
      action:      'USER_CREATED',
      module:      'USERS',
      entityId:    String(user._id),
      entityLabel: user.email,
      newValues:   { name: user.name, email: user.email, role: userRole },
    });

    const userObj = user.toObject() as unknown as Record<string, unknown>;
    delete userObj.password;
    res.status(201).json({ message: 'User created', user: userObj });

    // Send welcome email in background — don't block the response
    setImmediate(() => {
      sendWelcomeEmail({
        to:       normalizedEmail,
        name:     String(name).trim(),
        role:     userRole,
        password: String(password), // raw password before hashing
      }).then(r => {
        if (!r.success) console.error('[Users] Welcome email failed:', r.error);
      });
    });
  } catch (error: any) {
    if (error.code === 11000) {
      res.status(400).json({ message: 'Email already in use' });
      return;
    }
    console.error('[Users] createUser:', error);
    res.status(500).json({ message: 'Server error', ...safeError(error) });
  }
};

// ── GET /api/users ────────────────────────────────────────────────────────────
export const getAllUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const skip  = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find().select('-password').sort({ name: 1 }).skip(skip).limit(limit).lean(),
      User.countDocuments(),
    ]);

    res.json({ users, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('[Users] getAllUsers:', error);
    res.status(500).json({ message: 'Server error', ...safeError(error) });
  }
};

// ── GET /api/users/engineers ──────────────────────────────────────────────────
// Supports ?search=<name|email> and ?limit=<n> (max 200, default 100)
export const getEngineers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const search = req.query.search ? String(req.query.search).slice(0, 100) : '';
    const limit  = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 100));

    const filter: Record<string, unknown> = { role: { $in: ['ENGINEER', 'ADMIN'] } };
    if (search) {
      const safe = escapeRegex(search);
      filter.$or = [
        { name:  { $regex: safe, $options: 'i' } },
        { email: { $regex: safe, $options: 'i' } },
      ];
    }

    const engineers = await User
      .find(filter)
      .select('-password')
      .sort({ name: 1 })
      .limit(limit)
      .lean();

    res.json({ users: engineers, total: engineers.length });
  } catch (error) {
    console.error('[Users] getEngineers:', error);
    res.status(500).json({ message: 'Server error', ...safeError(error) });
  }
};

// ── GET /api/users/:id/allocation ─────────────────────────────────────────────
// Returns cross-project allocation for an engineer — catches over-allocation gaps.
export const getEngineerAllocation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ message: 'Invalid engineer ID' });
      return;
    }

    // Non-admins may only view their own allocation
    if (req.user?.role !== 'ADMIN' && req.user?.id !== id) {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }

    // Positional $ projection returns only the matching engineer subdoc
    const projects = await Project.find(
      { 'engineers.engineer': id, status: 'ACTIVE' },
      { name: 1, code: 1, status: 1, 'engineers.$': 1 }
    ).lean();

    let totalAllocation = 0;
    const breakdown = projects.map(p => {
      const eng  = (p.engineers as any[])[0];
      const alloc = eng?.allocationPercentage ?? 0;
      totalAllocation += alloc;
      return {
        projectId:            String(p._id),
        projectName:          p.name,
        projectCode:          p.code,
        role:                 eng?.role,
        allocationPercentage: alloc,
        startDate:            eng?.startDate,
        endDate:              eng?.endDate,
      };
    });

    res.json({
      engineerId:                id,
      totalAllocationPercentage: totalAllocation,
      isOverallocated:           totalAllocation > 100,
      projectCount:              projects.length,
      breakdown,
    });
  } catch (error) {
    console.error('[Users] getEngineerAllocation:', error);
    res.status(500).json({ message: 'Server error', ...safeError(error) });
  }
};

// ── GET /api/users/:id ────────────────────────────────────────────────────────
export const getUserById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const requestedId = req.params.id;

    if (req.user?.role !== 'ADMIN' && req.user?.id !== requestedId) {
      res.status(403).json({ message: 'Forbidden: you can only view your own profile' });
      return;
    }

    const user = await User.findById(requestedId).select('-password').lean();
    if (!user) { res.status(404).json({ message: 'User not found' }); return; }

    res.json({ user });
  } catch (error) {
    console.error('[Users] getUserById:', error);
    res.status(500).json({ message: 'Server error', ...safeError(error) });
  }
};

// ── PUT /api/users/:id — ADMIN only (enforced in route) ──────────────────────
// preventLastAdminDemotion middleware runs before this.
export const updateUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const requestedId = req.params.id;

    const target = await User.findById(requestedId).select('role name email').lean();
    if (!target) { res.status(404).json({ message: 'User not found' }); return; }

    // Only allowlisted safe fields from body
    const updateData = filterBody(req.body, USER_UPDATE_FIELDS) as Record<string, unknown>;
    if (req.body.name  !== undefined) updateData.name  = String(req.body.name).trim().slice(0, 100);
    if (req.body.phone !== undefined) updateData.phone = String(req.body.phone).trim().slice(0, 30);

    // Role changes: ADMIN only, validated against enum, guarded by preventLastAdminDemotion
    const VALID_ROLES = ['ADMIN', 'ENGINEER', 'CUSTOMER'];
    if (req.body.role !== undefined) {
      if (!VALID_ROLES.includes(req.body.role)) {
        res.status(400).json({ message: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` });
        return;
      }
      // Block promoting a non-admin to ADMIN if one already exists
      if (req.body.role === 'ADMIN' && target.role !== 'ADMIN') {
        const existingAdmin = await User.exists({ role: 'ADMIN' });
        if (existingAdmin) {
          res.status(400).json({ message: 'An admin account already exists. Only one admin is allowed.' });
          return;
        }
      }
      updateData.role = req.body.role;
    }

    const user = await User.findByIdAndUpdate(requestedId, updateData, {
      new: true,
      runValidators: true,
    }).select('-password').lean();

    if (!user) { res.status(404).json({ message: 'User not found' }); return; }

    if (updateData.role && updateData.role !== target.role) {
      auditLogger({
        req,
        action:      'USER_ROLE_CHANGED',
        module:      'USERS',
        entityId:    requestedId,
        entityLabel: target.email,
        oldValues:   { role: target.role },
        newValues:   { role: updateData.role },
      });
    } else {
      // Build oldValues snapshot from target for the fields that actually changed
      const oldValues: Record<string, unknown> = {};
      Object.keys(updateData).forEach(f => {
        const v = (target as Record<string, unknown>)[f];
        if (v !== undefined) oldValues[f] = v;
      });
      auditLogger({
        req,
        action:      'USER_UPDATED',
        module:      'USERS',
        entityId:    requestedId,
        entityLabel: target.email,
        oldValues,
        newValues:   updateData,
      });
    }

    res.json({ message: 'User updated', user });
  } catch (error) {
    console.error('[Users] updateUser:', error);
    res.status(500).json({ message: 'Server error', ...safeError(error) });
  }
};

// ── DELETE /api/users/:id — ADMIN only ───────────────────────────────────────
// preventLastAdminDeletion middleware runs before this.
export const deleteUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.params.id).select('name email role').lean();
    if (!user) { res.status(404).json({ message: 'User not found' }); return; }

    await User.deleteOne({ _id: req.params.id });

    auditLogger({
      req,
      action:      'USER_DELETED',
      module:      'USERS',
      entityId:    req.params.id,
      entityLabel: user.email,
      oldValues:   { name: user.name, email: user.email, role: user.role },
    });

    res.json({ message: 'User deleted' });
  } catch (error) {
    console.error('[Users] deleteUser:', error);
    res.status(500).json({ message: 'Server error', ...safeError(error) });
  }
};
