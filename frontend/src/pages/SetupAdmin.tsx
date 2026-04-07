import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, Loader2, Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react';

// ── Password strength rules ───────────────────────────────────────────────────
// Must match the server-side validation in registerAdminValidation.
const RULES = [
  { id: 'len',   label: 'At least 8 characters',   test: (p: string) => p.length >= 8 },
  { id: 'upper', label: 'One uppercase letter',     test: (p: string) => /[A-Z]/.test(p) },
  { id: 'digit', label: 'One number',               test: (p: string) => /[0-9]/.test(p) },
];

function PasswordRule({ met, label }: { met: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-xs">
      {met
        ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
        : <XCircle      className="h-3.5 w-3.5 text-ink-600    shrink-0" />}
      <span className={met ? 'text-emerald-400' : 'text-ink-500'}>{label}</span>
    </li>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SetupAdmin() {
  const { registerAdmin } = useAuth();
  const navigate           = useNavigate();

  const [name,        setName]        = useState('');
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [showPwd,     setShowPwd]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error,       setError]       = useState('');
  const [loading,     setLoading]     = useState(false);

  const rulesMet      = RULES.every(r => r.test(password));
  const confirmMatch  = confirm !== '' && password === confirm;
  const canSubmit     = name.trim() && email.trim() && rulesMet && confirmMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError('');
    setLoading(true);

    try {
      await registerAdmin(name.trim(), email.trim(), password);
      // On success the context is already logged in → go straight to admin dashboard
      navigate('/admin/dashboard', { replace: true });
    } catch (err: any) {
      const msg: string = err?.response?.data?.message ?? 'Setup failed. Please try again.';
      // 403 means an admin already exists — the endpoint is permanently disabled
      if (err?.response?.status === 403) {
        setError('An admin account already exists. Please log in instead.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden"
      style={{ background: '#050816' }}
    >
      {/* Background orbs — same as Login */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div
          className="absolute top-0 left-1/4 w-[500px] h-[500px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(109,40,217,0.20) 0%, transparent 65%)',
            filter: 'blur(80px)',
          }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-[500px] h-[400px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(79,70,229,0.16) 0%, transparent 65%)',
            filter: 'blur(80px)',
          }}
        />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="inline-flex h-14 w-14 items-center justify-center rounded-2xl mb-4"
            style={{
              background: 'linear-gradient(135deg, #6366f1, #7c3aed)',
              boxShadow: '0 0 32px rgba(99,102,241,0.55), 0 8px 24px rgba(0,0,0,0.4)',
            }}
          >
            <ShieldCheck className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-ink-100 tracking-tight">Initial Setup</h1>
          <p className="text-ink-500 text-sm mt-1">Create your administrator account</p>
        </div>

        {/* One-time banner */}
        <div
          className="mb-4 flex items-start gap-3 rounded-xl p-3 text-xs"
          style={{
            background: 'rgba(99,102,241,0.08)',
            border: '1px solid rgba(99,102,241,0.20)',
          }}
        >
          <ShieldCheck className="h-4 w-4 text-brand-400 shrink-0 mt-0.5" />
          <p className="text-ink-400 leading-relaxed">
            This setup screen is only available once — it will be permanently
            disabled after the first admin account is created.
          </p>
        </div>

        {/* Glass card */}
        <div
          className="rounded-2xl p-8 backdrop-blur-xl"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.10)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)',
          }}
        >
          <h2 className="text-base font-medium text-ink-200 mb-6">Admin account details</h2>

          {/* Error */}
          {error && (
            <div
              className="mb-4 p-3 rounded-xl text-sm text-red-400"
              style={{
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.18)',
              }}
            >
              {error}
              {error.includes('already exists') && (
                <Link
                  to="/login"
                  className="block mt-1 text-brand-400 underline underline-offset-2 hover:text-brand-300"
                >
                  Go to login →
                </Link>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div>
              <label htmlFor="setup-name" className="form-label">Full name</label>
              <input
                id="setup-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="form-input"
                placeholder="Enter your full name"
                autoComplete="name"
                autoFocus
                required
              />
            </div>

            {/* Email */}
            <div>
              <label htmlFor="setup-email" className="form-label">Email address</label>
              <input
                id="setup-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="form-input"
                placeholder="admin@company.com"
                autoComplete="username"
                required
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="setup-password" className="form-label">Password</label>
              <div className="relative">
                <input
                  id="setup-password"
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="form-input pr-10"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-300 transition-colors"
                  tabIndex={-1}
                  aria-label={showPwd ? 'Hide password' : 'Show password'}
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Inline strength checklist — appears once the user starts typing */}
              {password.length > 0 && (
                <ul className="mt-2 space-y-1 pl-1">
                  {RULES.map(r => (
                    <PasswordRule key={r.id} met={r.test(password)} label={r.label} />
                  ))}
                </ul>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label htmlFor="setup-confirm" className="form-label">Confirm password</label>
              <div className="relative">
                <input
                  id="setup-confirm"
                  type={showConfirm ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  className="form-input pr-10"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-300 transition-colors"
                  tabIndex={-1}
                  aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {/* Match indicator */}
              {confirm.length > 0 && (
                <p className={`mt-1.5 text-xs flex items-center gap-1.5 ${confirmMatch ? 'text-emerald-400' : 'text-red-400'}`}>
                  {confirmMatch
                    ? <><CheckCircle2 className="h-3.5 w-3.5" /> Passwords match</>
                    : <><XCircle      className="h-3.5 w-3.5" /> Passwords do not match</>}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !canSubmit}
              className="btn-primary w-full justify-center py-2.5 mt-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Create admin account
            </button>
          </form>

          {/* Back to login */}
          <p className="mt-5 text-center text-xs text-ink-600">
            Already have an account?{' '}
            <Link to="/login" className="text-brand-400 hover:text-brand-300 transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}