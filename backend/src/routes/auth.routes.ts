import { Router } from 'express';
import {
  login, register, logout, getMe,
  loginValidation, registerValidation,
  registerAdmin, registerAdminValidation,
  getSetupStatus,
  forgotPassword, resetPassword, changePassword,
} from '../controllers/auth.controller';
import { protect } from '../middleware/auth.middleware';
import { authRateLimiter } from '../middleware/rateLimiters';

const router = Router();

// ── Public setup probe ────────────────────────────────────────────────────────
router.get('/setup-status', getSetupStatus);

// ── Rate-limited public routes ────────────────────────────────────────────────
router.post('/register',       authRateLimiter, registerValidation,      register);
router.post('/login',          authRateLimiter, loginValidation,         login);
router.post('/register-admin', authRateLimiter, registerAdminValidation, registerAdmin);

// ── Password recovery (public, rate-limited) ──────────────────────────────────
router.post('/forgot-password', authRateLimiter, forgotPassword);
router.post('/reset-password',  authRateLimiter, resetPassword);

// ── Authenticated routes ──────────────────────────────────────────────────────
router.post('/logout',          logout);
router.get( '/me',              protect, getMe);
router.put( '/change-password', protect, changePassword);

export default router;
