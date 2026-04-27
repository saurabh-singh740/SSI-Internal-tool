import { Response } from 'express';
import validator from 'validator';
import User from '../models/User';
import { AuthRequest } from '../middleware/auth.middleware';
import { filterBody } from '../utils/filterBody';
import { auditLog } from '../utils/auditLogger';
import { safeError } from '../utils/apiError';
import { sendWelcomeEmail } from '../services/emailService';

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

    // Audit: log admin user creation — high-privilege action
    if (userRole === 'ADMIN') {
      await auditLog({
        action:  'user.admin_created',
        actorId:    req.user!.id,
        actorEmail: req.user!.email,
        targetType: 'user',
        targetId:   String(user._id),
        targetLabel: user.email,
        after: { role: userRole },
      });
    }

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
export const getEngineers = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const engineers = await User
      .find({ role: { $in: ['ENGINEER', 'ADMIN'] } })
      .select('-password')
      .sort({ name: 1 })
      .lean();
    res.json({ users: engineers });
  } catch (error) {
    console.error('[Users] getEngineers:', error);
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

    // Audit log for role changes
    if (updateData.role && updateData.role !== target.role) {
      await auditLog({
        action:      'user.role_changed',
        actorId:     req.user!.id,
        actorEmail:  req.user!.email,
        targetType:  'user',
        targetId:    requestedId,
        targetLabel: target.email,
        before: { role: target.role },
        after:  { role: updateData.role },
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

    // Audit log for user deletion
    await auditLog({
      action:      'user.deleted',
      actorId:     req.user!.id,
      actorEmail:  req.user!.email,
      targetType:  'user',
      targetId:    req.params.id,
      targetLabel: user.email,
      before: { name: user.name, email: user.email, role: user.role },
    });

    res.json({ message: 'User deleted' });
  } catch (error) {
    console.error('[Users] deleteUser:', error);
    res.status(500).json({ message: 'Server error', ...safeError(error) });
  }
};
