import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Briefcase, Loader2, ShieldAlert } from 'lucide-react';
import api from '../api/axios';

function roleDashboard(role?: string): string {
  if (role === 'ADMIN')    return '/admin/dashboard';
  if (role === 'ENGINEER') return '/engineer/dashboard';
  return '/projects';
}

export default function Login() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

  // ProtectedRoute saves the originally-requested path here so we can return
  // the user to exactly where they were trying to go after login.
  const from = (location.state as { from?: string })?.from ?? null;

  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [error,       setError]       = useState('');
  const [loading,     setLoading]     = useState(false);
  // null = probe pending, true = admin exists, false = first run
  const [adminExists, setAdminExists] = useState<boolean | null>(null);

  // Probe setup status on mount — determines whether to show the first-run banner.
  // We deliberately don't block render (no loading gate here); the banner appears
  // once the lightweight probe resolves.
  useEffect(() => {
    api.get<{ adminExists: boolean }>('/auth/setup-status')
      .then(res => setAdminExists(res.data.adminExists))
      .catch(() => setAdminExists(true)); // on error, assume configured (safe default)
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);
      // Honour the original destination from the email link; fall back to role default
      navigate(from ?? roleDashboard(user.role), { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden"
      style={{ background: '#050816' }}
    >
      {/* Background orbs */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div
          className="absolute top-0 left-1/4 w-[500px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(109,40,217,0.20) 0%, transparent 65%)', filter: 'blur(80px)' }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-[500px] h-[400px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(79,70,229,0.16) 0%, transparent 65%)', filter: 'blur(80px)' }}
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
            <Briefcase className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-ink-100 tracking-tight">Admin Panel</h1>
          <p className="text-ink-500 text-sm mt-1">Project Management Platform</p>
        </div>

        {/* First-run banner — only shown when no admin exists yet */}
        {adminExists === false && (
          <Link
            to="/setup"
            className="mb-4 flex items-start gap-3 rounded-xl p-3.5 transition-colors group"
            style={{
              background: 'rgba(99,102,241,0.08)',
              border: '1px solid rgba(99,102,241,0.25)',
            }}
          >
            <ShieldAlert className="h-5 w-5 text-brand-400 shrink-0 mt-0.5 group-hover:text-brand-300 transition-colors" />
            <div>
              <p className="text-sm font-medium text-brand-300 group-hover:text-brand-200 transition-colors">
                No admin account found
              </p>
              <p className="text-xs text-ink-500 mt-0.5">
                Click here to complete the initial setup →
              </p>
            </div>
          </Link>
        )}

        {/* Glass card */}
        <div
          className="rounded-2xl p-8 backdrop-blur-xl"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.10)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)',
          }}
        >
          <h2 className="text-base font-medium text-ink-200 mb-6">Sign in to your account</h2>

          {error && (
            <div
              className="mb-4 p-3 rounded-xl text-sm text-red-400"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)' }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="form-label">Email address</label>
              <input
                id="login-email"
                name="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="form-input"
                placeholder="you@example.com"
                autoComplete="username"
                required
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="login-password" className="form-label">Password</label>
              <input
                id="login-password"
                name="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="form-input"
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-2.5 mt-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign in
            </button>
          </form>

          {/* First-run CTA inside card (secondary) */}
          {adminExists === false && (
            <div
              className="mt-5 pt-4"
              style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
            >
              <p className="text-xs text-ink-500 text-center">
                First time here?{' '}
                <Link
                  to="/setup"
                  className="text-brand-400 hover:text-brand-300 transition-colors font-medium"
                >
                  Create admin account
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}