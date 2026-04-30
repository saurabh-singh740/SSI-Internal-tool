import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { KeyRound, CheckCircle2, AlertCircle } from 'lucide-react';
import api from '../api/axios';

export default function ResetPassword() {
  const [searchParams]               = useSearchParams();
  const navigate                     = useNavigate();
  const token                        = searchParams.get('token') || '';

  const [password,   setPassword]    = useState('');
  const [confirm,    setConfirm]     = useState('');
  const [loading,    setLoading]     = useState(false);
  const [done,       setDone]        = useState(false);
  const [error,      setError]       = useState('');

  useEffect(() => {
    if (!token) setError('Reset link is missing or invalid. Please request a new one.');
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 6)  { setError('Password must be at least 6 characters'); return; }

    setLoading(true);
    setError('');
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Reset failed. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
         style={{ background: 'linear-gradient(135deg,#050816 0%,#0f0a1e 100%)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
               style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed)' }}>
            <KeyRound className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">Set New Password</h1>
          <p className="text-sm text-ink-400 mt-1">Choose a strong password for your account</p>
        </div>

        <div className="rounded-2xl p-6"
             style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>

          {done ? (
            <div className="text-center py-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <h2 className="text-base font-semibold text-white mb-2">Password reset!</h2>
              <p className="text-sm text-ink-400">Redirecting you to login…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-start gap-2 p-3 rounded-lg text-sm text-red-400"
                     style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)' }}>
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-ink-400 mb-1.5">New password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  required
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-ink-100 placeholder-ink-600"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', outline: 'none' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-400 mb-1.5">Confirm password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repeat your new password"
                  required
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-ink-100 placeholder-ink-600"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', outline: 'none' }}
                />
              </div>
              <button
                type="submit"
                disabled={loading || !token || !password || !confirm}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all"
                style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed)' }}
              >
                {loading ? 'Resetting…' : 'Reset Password'}
              </button>
            </form>
          )}
        </div>

        {!done && (
          <div className="text-center mt-5">
            <Link to="/forgot-password" className="text-xs text-ink-500 hover:text-ink-300 transition-colors">
              Request a new reset link
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
