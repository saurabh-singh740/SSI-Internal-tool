import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2, ShieldAlert } from 'lucide-react';
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
    <div className="min-h-screen flex">

      {/* ── Left branding panel ─────────────────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center px-16 relative overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #0f0c29, #1a1050, #24243e)' }}
      >
        {/* Glow orbs */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 70%)', filter: 'blur(60px)' }} />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.20) 0%, transparent 70%)', filter: 'blur(60px)' }} />
        </div>

        <div className="relative text-center">
          {/* Logo on dark — white pill container */}
          <div className="inline-flex items-center justify-center rounded-2xl px-8 py-4 mb-8"
            style={{ background: 'rgba(255,255,255,0.95)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
            <img src="/assets/2.jpg" alt="StallionSI" className="object-contain" style={{ height: '60px', width: 'auto' }} />
          </div>
          <h1 className="text-3xl font-bold text-white mb-3 tracking-tight">STALLION SI - IPM</h1>
          <p className="text-indigo-300 text-base mb-10">Integrated Project Management</p>

          {/* Feature bullets */}
          <div className="space-y-4 text-left max-w-xs mx-auto">
            {[
              'Manage projects & timesheets',
              'Track billing & payments',
              'Collaborate with your team',
            ].map((f) => (
              <div key={f} className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-indigo-400 flex-shrink-0" />
                <p className="text-sm text-indigo-200">{f}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="absolute bottom-6 text-xs text-indigo-500">© {new Date().getFullYear()} StallionSI. All rights reserved.</p>
      </div>

      {/* ── Right form panel ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-white">

        {/* Mobile logo */}
        <div className="lg:hidden mb-8 text-center">
          <img src="/assets/2.jpg" alt="StallionSI" className="mx-auto mb-3 object-contain" style={{ height: '56px' }} />
          <h1 className="text-xl font-bold text-gray-900">STALLION SI - IPM</h1>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
            <p className="text-gray-500 text-sm mt-1">Sign in to your account to continue</p>
          </div>

          {/* First-run banner */}
          {adminExists === false && (
            <Link to="/setup"
              className="mb-5 flex items-start gap-3 rounded-xl p-3.5"
              style={{ background: '#eef2ff', border: '1px solid #c7d2fe' }}
            >
              <ShieldAlert className="h-5 w-5 text-indigo-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-indigo-700">No admin account found</p>
                <p className="text-xs text-indigo-500 mt-0.5">Click here to complete the initial setup →</p>
              </div>
            </Link>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-xl text-sm text-red-600"
              style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
              <input
                id="login-email" name="email" type="email"
                value={email} onChange={e => setEmail(e.target.value)}
                className="w-full rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none transition-all"
                style={{ border: '1.5px solid #e5e7eb', background: '#f9fafb' }}
                onFocus={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.background = '#fff'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#f9fafb'; e.currentTarget.style.boxShadow = 'none'; }}
                placeholder="you@company.com" autoComplete="username" required autoFocus
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="login-password" className="block text-sm font-medium text-gray-700">Password</label>
                <Link to="/forgot-password" className="text-xs text-indigo-600 hover:text-indigo-500 transition-colors">
                  Forgot password?
                </Link>
              </div>
              <input
                id="login-password" name="password" type="password"
                value={password} onChange={e => setPassword(e.target.value)}
                className="w-full rounded-xl px-4 py-2.5 text-sm text-gray-900 outline-none transition-all"
                style={{ border: '1.5px solid #e5e7eb', background: '#f9fafb' }}
                onFocus={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.background = '#fff'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)'; }}
                onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#f9fafb'; e.currentTarget.style.boxShadow = 'none'; }}
                placeholder="••••••••" autoComplete="current-password" required
              />
            </div>
            <button
              type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
              style={{ background: 'linear-gradient(135deg, #6366f1, #7c3aed)', boxShadow: '0 4px 16px rgba(99,102,241,0.40)' }}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign in
            </button>
          </form>

          {adminExists === false && (
            <p className="mt-6 text-xs text-center text-gray-400">
              First time here?{' '}
              <Link to="/setup" className="text-indigo-600 hover:text-indigo-500 font-medium transition-colors">
                Create admin account
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}