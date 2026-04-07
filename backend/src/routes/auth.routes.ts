import { Router } from 'express';
import {
  login, register, logout, getMe,
  loginValidation, registerValidation,
  registerAdmin, registerAdminValidation,
  getSetupStatus,
} from '../controllers/auth.controller';
import { protect } from '../middleware/auth.middleware';
import { authRateLimiter } from '../middleware/rateLimiters';

const router = Router();

// ── Public setup probe (no auth, no rate limit — called on every Login page load)
router.get('/setup-status', getSetupStatus);

// ── Rate-limited public routes ────────────────────────────────────────────────
router.post('/register',       authRateLimiter, registerValidation,      register);
router.post('/login',          authRateLimiter, loginValidation,         login);

// Bootstrap-only admin registration — permanently disabled after the first ADMIN
// account exists. Still rate-limited to prevent enumeration/timing attacks.
router.post('/register-admin', authRateLimiter, registerAdminValidation, registerAdmin);

// ── Authenticated routes ──────────────────────────────────────────────────────
// NOT rate-limited: /me is called on every page load to rehydrate session state;
// /logout is low-risk and must always succeed.
router.post('/logout', logout);
router.get('/me',      protect, getMe);

export default router;
