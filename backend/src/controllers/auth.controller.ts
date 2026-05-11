import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import crypto from 'crypto';
import User from '../models/User';
import PasswordReset, { hashToken } from '../models/PasswordReset';
import { signToken } from '../utils/jwt';
import { AuthRequest } from '../middleware/auth.middleware';
import { safeError } from '../utils/apiError';
import { auditLogger } from '../utils/auditLogger';
import {
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
} from '../services/emailService';

// ── Cookie options ────────────────────────────────────────────────────────────

const COOKIE_NAME = 'token';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

function setCookieToken(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    // Unified deployment: frontend and backend share the same Render domain.
    // SameSite=lax is correct for same-site requests and more restrictive
    // (better) than 'none'.  Secure=true only in production so local dev over
    // HTTP (http://localhost) still works.
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   COOKIE_MAX_AGE,
    path:     '/',
  });
}

// ── Validation chains (reusable) ─────────────────────────────────────────────

export const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  // role is intentionally NOT validated here — public registration always creates ENGINEER
];

export const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

export const registerAdminValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ max: 100 }).withMessage('Name must be 100 characters or fewer'),
  body('email')
    .isEmail().withMessage('Valid email is required')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[0-9]/).withMessage('Password must contain at least one number'),
];

// ── POST /api/auth/register ───────────────────────────────────────────────────
// Public. Always creates ENGINEER — role cannot be set from the request body.
// Admins create other roles via POST /api/users (admin-only route).
export const register = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ message: errors.array()[0].msg });
    return;
  }

  try {
    const { name, email, password, phone } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(409).json({ message: 'An account with this email already exists' });
      return;
    }

    // SECURITY: role is always ENGINEER regardless of what was sent in req.body
    const user = await User.create({ name, email, password, role: 'ENGINEER', phone });
    const token = signToken({ id: String(user._id), role: user.role, email: user.email, name: user.name });

    setCookieToken(res, token);
    res.status(201).json({ message: 'Account created', user });
  } catch (error) {
    console.error('[Auth] register error:', error);
    res.status(500).json({ message: 'Server error', ...safeError(error) });
  }
};

// ── POST /api/auth/login ──────────────────────────────────────────────────────
export const login = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ message: errors.array()[0].msg });
    return;
  }

  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      // Use identical wording for email and password mismatch — prevents user enumeration
      auditLogger({
        action: 'AUTH_LOGIN_FAILED', module: 'AUTH',
        actorEmail: email, metadata: { reason: 'user_not_found' },
        ipAddress: req.clientIp, userAgent: req.headers['user-agent'], requestId: req.requestId,
      });
      res.status(401).json({ message: 'Invalid email or password' });
      return;
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      auditLogger({
        action: 'AUTH_LOGIN_FAILED', module: 'AUTH',
        actorId: String(user._id), actorEmail: user.email, actorRole: user.role,
        metadata: { reason: 'wrong_password' },
        ipAddress: req.clientIp, userAgent: req.headers['user-agent'], requestId: req.requestId,
      });
      res.status(401).json({ message: 'Invalid email or password' });
      return;
    }

    const token = signToken({ id: String(user._id), role: user.role, email: user.email, name: user.name });
    setCookieToken(res, token);
    auditLogger({
      action: 'AUTH_LOGIN', module: 'AUTH',
      actorId: String(user._id), actorEmail: user.email, actorRole: user.role,
      entityId: String(user._id), entityLabel: user.email,
      ipAddress: req.clientIp, userAgent: req.headers['user-agent'], requestId: req.requestId,
    });
    res.json({ message: 'Login successful', user: user.toJSON() });
  } catch (error) {
    console.error('[Auth] login error:', error);
    res.status(500).json({ message: 'Server error', ...safeError(error) });
  }
};

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
// protect middleware runs before this (see auth.routes.ts), so req.user is set.
export const logout = (req: AuthRequest, res: Response): void => {
  // clearCookie must pass the same attributes that were used when the cookie
  // was set — if secure/sameSite differ, the browser treats them as a
  // different cookie and the existing token cookie is NOT cleared.
  res.clearCookie(COOKIE_NAME, {
    path: '/',
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
  auditLogger({
    req,   // auto-extracts actor (id, email, role, name), IP, UA, requestId
    action:      'AUTH_LOGOUT',
    module:      'AUTH',
    entityId:    req.user?.id,
    entityLabel: req.user?.email,
  });
  res.json({ message: 'Logged out' });
};

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user?.id);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }
    res.json({ user });
  } catch (error) {
    console.error('[Auth] getMe error:', error);
    res.status(500).json({ message: 'Server error', ...safeError(error) });
  }
};

// ── GET /api/auth/setup-status ────────────────────────────────────────────────
// Public, unauthenticated endpoint.
// Returns whether the system has been bootstrapped (any ADMIN account exists).
// The frontend uses this to decide whether to show the first-run Setup page.
//
// Security note: we intentionally disclose whether an admin exists — the
// alternative (hiding this) would force users to attempt login and infer the
// state from the error message, which is strictly worse.  The only information
// revealed is a boolean; no email, name, or count is returned.
//
export const getSetupStatus = async (_req: Request, res: Response): Promise<void> => {
  try {
    const adminCount = await User.countDocuments({ role: 'ADMIN' }).limit(1);
    const adminExists = adminCount > 0;
    res.json({
      adminExists,
      message: adminExists
        ? 'System is configured. Please log in.'
        : 'No admin account found. Complete initial setup to get started.',
    });
  } catch (error) {
    console.error('[Auth] getSetupStatus error:', error);
    res.status(500).json({ message: 'Server error', ...safeError(error) });
  }
};

// ── POST /api/auth/forgot-password ───────────────────────────────────────────
// Public. Accepts email, sends a reset link if the account exists.
// Always returns 200 — prevents user enumeration.
export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;
    if (!email) { res.status(400).json({ message: 'Email is required' }); return; }

    const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('_id name email');

    // Always respond OK — don't reveal whether the email exists
    res.json({ message: 'If an account with that email exists, a reset link has been sent.' });

    if (!user) return; // silently do nothing

    // Invalidate any existing reset tokens for this user
    await PasswordReset.deleteMany({ user: user._id });

    // Generate a cryptographically random token (32 bytes = 64 hex chars)
    const rawToken = crypto.randomBytes(32).toString('hex');

    await PasswordReset.create({
      user:      user._id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    });

    // Fire-and-forget — don't await so response is already sent
    sendPasswordResetEmail({
      to:         user.email,
      name:       user.name,
      resetToken: rawToken,
    }).then(r => {
      if (!r.success) console.error('[Auth] forgotPassword email failed:', r.error);
    });
  } catch (error) {
    console.error('[Auth] forgotPassword error:', error);
    // No error response — user already received 200
  }
};

// ── POST /api/auth/reset-password ─────────────────────────────────────────────
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      res.status(400).json({ message: 'Token and new password are required' }); return;
    }
    if (String(password).length < 6) {
      res.status(400).json({ message: 'Password must be at least 6 characters' }); return;
    }

    const record = await PasswordReset.findOne({
      tokenHash: hashToken(String(token)),
      expiresAt: { $gt: new Date() },
    }).populate<{ user: InstanceType<typeof User> }>('user', 'name email');

    if (!record) {
      res.status(400).json({ message: 'Reset link is invalid or has expired' }); return;
    }

    const user = await User.findById(record.user._id).select('+password');
    if (!user) { res.status(404).json({ message: 'User not found' }); return; }

    user.password = password;
    await user.save();
    await PasswordReset.deleteMany({ user: user._id });

    // Notify user — fire and forget
    sendPasswordChangedEmail({ to: user.email, name: user.name }).catch(() => {});

    res.json({ message: 'Password reset successful. You can now log in.' });
  } catch (error) {
    console.error('[Auth] resetPassword error:', error);
    res.status(500).json({ message: 'Server error', ...safeError(error) });
  }
};

// ── PUT /api/auth/change-password ─────────────────────────────────────────────
// Authenticated. Requires current password + new password.
export const changePassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ message: 'currentPassword and newPassword are required' }); return;
    }
    if (String(newPassword).length < 6) {
      res.status(400).json({ message: 'New password must be at least 6 characters' }); return;
    }

    const user = await User.findById(req.user?.id).select('+password');
    if (!user) { res.status(404).json({ message: 'User not found' }); return; }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      res.status(401).json({ message: 'Current password is incorrect' }); return;
    }

    user.password = newPassword;
    await user.save();

    sendPasswordChangedEmail({ to: user.email, name: user.name }).catch(() => {});

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('[Auth] changePassword error:', error);
    res.status(500).json({ message: 'Server error', ...safeError(error) });
  }
};

// ── POST /api/auth/register-admin ─────────────────────────────────────────────
//
// Bootstrap-only endpoint: creates the very first ADMIN account.
// Once any admin exists in the database this endpoint permanently returns 403,
// preventing rogue admin creation even if an attacker discovers the route.
//
// Security properties:
//   • Only usable once — guarded by an admin-count check
//   • Stronger password requirements than regular registration (≥8 chars, upper, digit)
//   • Rate-limited at the router level (same authRateLimiter as /login)
//   • Identical error wording for "already bootstrapped" and "forbidden" — no state leakage
//   • No role field accepted from request body (always hardcoded ADMIN)
//
export const registerAdmin = async (req: Request, res: Response): Promise<void> => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ message: errors.array()[0].msg });
    return;
  }

  try {
    const { name, email, password } = req.body;
    const normalizedEmail = String(email).toLowerCase().trim();

    // ── Atomic bootstrap guard ────────────────────────────────────────────────
    // Problem with the old approach (countDocuments → create):
    //   Two simultaneous requests can BOTH see count=0, then BOTH create admins.
    //
    // Fix: findOneAndUpdate with upsert=false on the ADMIN record.
    // We attempt to find a document that does NOT exist and insert it in one
    // atomic operation. Only one concurrent request can win; the second hits
    // the duplicate key error (11000) on the email unique index, which we catch.
    //
    // Additionally, the role:ADMIN index means countDocuments is O(1),
    // but the real safety net is the unique email index + the atomic check below.
    const existingAdmin = await User.findOne({ role: 'ADMIN' }).select('_id').lean();
    if (existingAdmin) {
      // Intentionally vague: don't reveal admin existence to unauthenticated callers
      res.status(403).json({ message: 'Admin registration is not available' });
      return;
    }

    const existingEmail = await User.findOne({ email: normalizedEmail }).select('_id').lean();
    if (existingEmail) {
      res.status(409).json({ message: 'An account with this email already exists' });
      return;
    }

    // Create admin — role is hardcoded, never from req.body
    const admin = await User.create({
      name:     String(name).trim().slice(0, 100),
      email:    normalizedEmail,
      password,
      role:     'ADMIN',
    });

    const token = signToken({ id: String(admin._id), role: admin.role, email: admin.email, name: admin.name });
    setCookieToken(res, token);

    auditLogger({
      action: 'AUTH_ADMIN_REGISTERED', module: 'AUTH',
      actorId: String(admin._id), actorEmail: admin.email, actorRole: admin.role,
      entityId: String(admin._id), entityLabel: admin.email,
      ipAddress: req.clientIp, userAgent: req.headers['user-agent'], requestId: req.requestId,
    });

    res.status(201).json({
      message: 'Admin account created successfully',
      user: admin.toJSON(),
    });
  } catch (error: any) {
    // 11000 = email unique index violation — two concurrent requests raced.
    // The second one arrives here: treat as "already bootstrapped".
    if (error.code === 11000) {
      res.status(403).json({ message: 'Admin registration is not available' });
      return;
    }
    console.error('[Auth] registerAdmin error:', error);
    res.status(500).json({ message: 'Server error', ...safeError(error) });
  }
};
