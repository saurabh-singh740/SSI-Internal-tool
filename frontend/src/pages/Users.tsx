import { useEffect, useRef, useState } from 'react';
import { Trash2, UserPlus, Loader2, X, Users as UsersIcon } from 'lucide-react';
import ConfirmModal from '../components/ui/ConfirmModal';
import api from '../api/axios';
import { User, UserRole } from '../types';
import Header from '../components/layout/Header';
import { useAuth } from '../context/AuthContext';
import { clsx } from 'clsx';

const roleBadge: Record<UserRole, string> = {
  ADMIN:    'badge badge-red',
  ENGINEER: 'badge badge-blue',
  CUSTOMER: 'badge badge-green',
};

// ── Slide-over create-user panel ──────────────────────────────────────────────
function CreateUserPanel({
  open,
  onClose,
  onCreated,
  adminExists,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  adminExists: boolean;
}) {
  const [form, setForm]         = useState({ name: '', email: '', password: '', role: 'ENGINEER' as UserRole });
  const [submitting, setSub]    = useState(false);
  const [error, setError]       = useState('');
  const firstRef                = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setForm({ name: '', email: '', password: '', role: 'ENGINEER' });
      setError('');
      setTimeout(() => firstRef.current?.focus(), 80);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSub(true);
    setError('');
    try {
      await api.post('/users', form);
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to create user');
    } finally {
      setSub(false);
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md z-50 flex flex-col backdrop-blur-xl"
        style={{ background: 'rgba(10,13,28,0.92)', borderLeft: '1px solid rgba(255,255,255,0.08)', boxShadow: '-8px 0 32px rgba(0,0,0,0.5)' }}>
        {/* Panel header */}
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div>
            <h2 className="text-base font-semibold text-ink-100">Add User</h2>
            <p className="text-sm text-ink-400 mt-0.5">Create a new platform account</p>
          </div>
          <button onClick={onClose} className="btn-icon">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Panel body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {error && (
            <div className="p-3 rounded-lg text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)' }}>
              {error}
            </div>
          )}

          <div>
            <label htmlFor="user-name" className="form-label">Full Name *</label>
            <input
              id="user-name"
              name="name"
              ref={firstRef}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="form-input"
              placeholder="Alice Smith"
              required
            />
          </div>
          <div>
            <label htmlFor="user-email" className="form-label">Email Address *</label>
            <input
              id="user-email"
              name="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="form-input"
              placeholder="alice@example.com"
              required
            />
          </div>
          <div>
            <label htmlFor="user-password" className="form-label">Password *</label>
            <input
              id="user-password"
              name="password"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="form-input"
              placeholder="Min. 6 characters"
              required
              minLength={6}
            />
          </div>
          <div>
            <label htmlFor="user-role" className="form-label">Role *</label>
            <select
              id="user-role"
              name="role"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
              className="form-select"
            >
              {!adminExists && <option value="ADMIN">Admin</option>}
              <option value="ENGINEER">Engineer</option>
              <option value="CUSTOMER">Executive Ops</option>
            </select>
          </div>
        </form>

        {/* Panel footer */}
        <div className="px-6 py-4 flex justify-end gap-2 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            onClick={(e) => { e.preventDefault(); handleSubmit(e as any); }}
            disabled={submitting}
            className="btn-primary"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Create User
          </button>
        </div>
      </div>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Users() {
  const { user: currentUser }       = useAuth();
  const [users, setUsers]           = useState<User[]>([]);
  const [loading, setLoading]       = useState(true);
  const [panelOpen, setPanel]       = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleteError, setDeleteError]   = useState('');

  const fetchUsers = () => {
    setLoading(true);
    api.get('/users').then((r) => setUsers(r.data.users)).finally(() => setLoading(false));
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteError('');
    try {
      await api.delete(`/users/${deleteTarget._id}`);
      setUsers((prev) => prev.filter((u) => u._id !== deleteTarget._id));
      setDeleteTarget(null);
    } catch (err: any) {
      setDeleteError(err?.response?.data?.message || 'Failed to delete user');
    }
  };

  return (
    <div>
      <Header
        title="Users"
        subtitle="Manage platform accounts and roles"
        actions={
          <button onClick={() => setPanel(true)} className="btn-primary text-xs py-1.5 px-3">
            <UserPlus className="h-3.5 w-3.5" /> Add User
          </button>
        }
      />

      <CreateUserPanel
        open={panelOpen}
        onClose={() => setPanel(false)}
        onCreated={fetchUsers}
        adminExists={users.some((u) => u.role === 'ADMIN')}
      />

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete user"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirm}
        onCancel={() => { setDeleteTarget(null); setDeleteError(''); }}
        error={deleteError}
      />

      <div className="page-content">
        <div className="card overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-10 w-full" />)}
            </div>
          ) : users.length === 0 ? (
            <div className="empty-state">
              <UsersIcon className="h-10 w-10 text-ink-500 mb-3" />
              <h3 className="text-sm font-semibold text-ink-100">No users yet</h3>
              <p className="text-sm text-ink-400 mb-4">Add the first user to the platform.</p>
              <button onClick={() => setPanel(true)} className="btn-primary text-xs">
                <UserPlus className="h-3.5 w-3.5" /> Add User
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Phone</th>
                    <th>Joined</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u._id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <div className={clsx(
                            'h-7 w-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0',
                            u.role === 'ADMIN' ? 'bg-red-500' : u.role === 'ENGINEER' ? 'bg-blue-600' : 'bg-emerald-600'
                          )}>
                            {(u?.name ?? u?.email ?? '?').charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-ink-100">{u?.name || u?.email || 'Unknown User'}</span>
                        </div>
                      </td>
                      <td className="text-ink-400">{u.email}</td>
                      <td><span className={roleBadge[u.role]}>{u.role === 'CUSTOMER' ? 'Executive Ops' : u.role}</span></td>
                      <td className="text-ink-400">{(u as any).phone || '—'}</td>
                      <td className="text-ink-400 tabular-nums">{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td>
                        <button
                          onClick={() => setDeleteTarget(u)}
                          disabled={u._id === currentUser?._id}
                          className="btn-icon h-7 w-7 text-ink-400 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-ink-400 disabled:hover:bg-transparent"
                          title={u._id === currentUser?._id ? 'Cannot delete your own account' : 'Delete user'}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}