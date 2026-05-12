import { useEffect, useRef, useState } from 'react';
import {
  Trash2, UserPlus, Loader2, X, Users as UsersIcon,
  Search, RefreshCw, Shield, Wrench, Building,
} from 'lucide-react';
import ConfirmModal from '../components/ui/ConfirmModal';
import api from '../api/axios';
import { User, UserRole } from '../types';
import Header from '../components/layout/Header';
import { useAuth } from '../context/AuthContext';

// ── Role config ────────────────────────────────────────────────────────────────

const ROLE_CFG = {
  ADMIN:    { bg: 'rgba(239,68,68,0.12)',   text: '#f87171', border: 'rgba(239,68,68,0.2)',   avatar: 'linear-gradient(135deg,#ef4444,#dc2626)', icon: Shield    },
  ENGINEER: { bg: 'rgba(99,102,241,0.12)',  text: '#818cf8', border: 'rgba(99,102,241,0.2)',  avatar: 'linear-gradient(135deg,#6366f1,#7c3aed)', icon: Wrench    },
  CUSTOMER: { bg: 'rgba(16,185,129,0.12)',  text: '#4ade80', border: 'rgba(16,185,129,0.2)',  avatar: 'linear-gradient(135deg,#10b981,#059669)', icon: Building  },
} as const;

const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: 'Admin', ENGINEER: 'Engineer', CUSTOMER: 'Exec Ops',
};

function RoleBadge({ role }: { role: UserRole }) {
  const c = ROLE_CFG[role] ?? ROLE_CFG.CUSTOMER;
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide leading-none"
          style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
      {ROLE_LABEL[role]}
    </span>
  );
}

function Avatar({ user }: { user: User }) {
  const c = ROLE_CFG[user.role] ?? ROLE_CFG.CUSTOMER;
  return (
    <div className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
         style={{ background: c.avatar }}>
      {(user.name ?? user.email ?? '?').charAt(0).toUpperCase()}
    </div>
  );
}

// ── Create user side panel ─────────────────────────────────────────────────────

function CreatePanel({
  open, onClose, onCreated, adminExists,
}: { open: boolean; onClose: () => void; onCreated: () => void; adminExists: boolean }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'ENGINEER' as UserRole });
  const [submitting, setSub] = useState(false);
  const [error, setError]   = useState('');
  const firstRef            = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setForm({ name: '', email: '', password: '', role: 'ENGINEER' });
      setError('');
      setTimeout(() => firstRef.current?.focus(), 80);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSub(true); setError('');
    try {
      await api.post('/users', form);
      onCreated(); onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to create user');
    } finally { setSub(false); }
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={onClose} />
      <div
        className="fixed right-0 top-0 h-full z-50 flex flex-col"
        style={{
          width: 'min(400px, 100vw)',
          background: 'rgba(7,6,24,0.97)',
          borderLeft: '1px solid rgba(255,255,255,0.09)',
          backdropFilter: 'blur(24px)',
        }}
      >
        <div className="px-5 py-4 flex items-center justify-between flex-shrink-0"
             style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div>
            <p className="text-sm font-bold text-gray-100">Add User</p>
            <p className="text-[10px] text-gray-600 mt-0.5">Create a new platform account</p>
          </div>
          <button onClick={onClose}
                  className="h-6 w-6 rounded flex items-center justify-center text-gray-500 hover:text-white"
                  style={{ background: 'rgba(255,255,255,0.06)' }}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div className="px-3 py-2 rounded-lg text-xs text-red-400"
                 style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)' }}>
              {error}
            </div>
          )}

          {[
            { id: 'u-name',  label: 'Full Name *',     name: 'name',  type: 'text',     ref: firstRef, placeholder: 'Alice Smith' },
            { id: 'u-email', label: 'Email *',          name: 'email', type: 'email',    ref: null,     placeholder: 'alice@example.com' },
            { id: 'u-pass',  label: 'Password *',       name: 'password', type: 'password', ref: null, placeholder: 'Min. 6 characters' },
          ].map(({ id, label, name, type, ref: r, placeholder }) => (
            <div key={id}>
              <label className="block text-[10px] font-medium text-gray-500 mb-1.5 uppercase tracking-widest">{label}</label>
              <input
                id={id} type={type}
                ref={r as any}
                value={(form as any)[name]}
                onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))}
                placeholder={placeholder}
                required
                minLength={name === 'password' ? 6 : undefined}
                className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-gray-700 outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
              />
            </div>
          ))}

          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-1.5 uppercase tracking-widest">Role *</label>
            <select
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole }))}
              className="w-full px-3 py-2 rounded-lg text-sm text-white outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
            >
              {!adminExists && <option value="ADMIN" style={{ background: '#070618' }}>Admin</option>}
              <option value="ENGINEER" style={{ background: '#070618' }}>Engineer</option>
              <option value="CUSTOMER" style={{ background: '#070618' }}>Executive Ops</option>
            </select>
          </div>
        </form>

        <div className="px-5 py-3 flex gap-2 flex-shrink-0"
             style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button type="button" onClick={onClose}
                  className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white transition-colors"
                  style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit as any}
            disabled={submitting}
            className="flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed)' }}
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
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
  const [search, setSearch]         = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [panelOpen, setPanel]       = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleteError, setDeleteError]   = useState('');

  const fetchUsers = () => {
    setLoading(true);
    api.get('/users').then(r => setUsers(r.data.users)).finally(() => setLoading(false));
  };
  useEffect(() => { fetchUsers(); }, []);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleteError('');
    try {
      await api.delete(`/users/${deleteTarget._id}`);
      setUsers(prev => prev.filter(u => u._id !== deleteTarget._id));
      setDeleteTarget(null);
    } catch (err: any) {
      setDeleteError(err?.response?.data?.message || 'Failed to delete user');
    }
  };

  const filtered = users.filter(u => {
    const matchSearch = !search ||
      u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase());
    const matchRole = !roleFilter || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const roleCount = (role: UserRole) => users.filter(u => u.role === role).length;

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#050816' }}>
      <Header
        title="Users"
        subtitle="Platform accounts and roles"
        actions={
          <button
            onClick={() => setPanel(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
            style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed)' }}
          >
            <UserPlus className="h-3.5 w-3.5" /> Add User
          </button>
        }
      />

      <CreatePanel
        open={panelOpen}
        onClose={() => setPanel(false)}
        onCreated={fetchUsers}
        adminExists={users.some(u => u.role === 'ADMIN')}
      />

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete user"
        description={`Delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirm}
        onCancel={() => { setDeleteTarget(null); setDeleteError(''); }}
        error={deleteError}
      />

      {/* ── Stats + toolbar row ──────────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-30 px-4 py-2.5 flex flex-wrap items-center gap-2"
        style={{
          background: 'rgba(5,8,22,0.92)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        {/* Role pills */}
        {(['ADMIN','ENGINEER','CUSTOMER'] as UserRole[]).map(role => {
          const c = ROLE_CFG[role];
          const Icon = c.icon;
          const active = roleFilter === role;
          return (
            <button
              key={role}
              onClick={() => setRoleFilter(prev => prev === role ? '' : role)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all text-[11px]"
              style={{
                background: active ? `${c.text}22` : 'rgba(255,255,255,0.04)',
                border: `1px solid ${active ? c.text + '44' : 'rgba(255,255,255,0.07)'}`,
              }}
            >
              <Icon className="h-3 w-3 flex-shrink-0" style={{ color: c.text }} />
              <span className="font-bold text-white tabular-nums">{roleCount(role)}</span>
              <span className="text-gray-500">{ROLE_LABEL[role]}</span>
            </button>
          );
        })}

        <div className="relative flex-1 min-w-[140px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-600 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search users…"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs text-white placeholder-gray-700 outline-none"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
          />
        </div>

        {(search || roleFilter) && (
          <button
            onClick={() => { setSearch(''); setRoleFilter(''); }}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-gray-700">{filtered.length} of {users.length}</span>
          <button onClick={fetchUsers} className="text-gray-600 hover:text-gray-300 transition-colors">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="px-4 pt-4">
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          {loading ? (
            <div className="p-4 space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <UsersIcon className="h-8 w-8 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm font-medium">
                {users.length === 0 ? 'No users yet' : 'No users match the filter'}
              </p>
              {users.length === 0 && (
                <button onClick={() => setPanel(true)} className="inline-flex items-center gap-1 mt-3 text-xs text-indigo-400 hover:text-indigo-200">
                  <UserPlus className="h-3 w-3" /> Add first user
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.015)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <th className="px-4 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest">User</th>
                    <th className="px-3 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest hidden sm:table-cell">Email</th>
                    <th className="px-3 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest w-20">Role</th>
                    <th className="px-3 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest w-24 hidden md:table-cell">Joined</th>
                    <th className="px-2 py-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(u => (
                    <tr
                      key={u._id}
                      className="group transition-colors"
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar user={u} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-200 truncate">{u.name || u.email || 'Unknown'}</p>
                            <p className="text-[10px] text-gray-600 truncate sm:hidden">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 hidden sm:table-cell">
                        <span className="text-xs text-gray-500">{u.email}</span>
                      </td>
                      <td className="px-3 py-2.5"><RoleBadge role={u.role} /></td>
                      <td className="px-3 py-2.5 hidden md:table-cell">
                        <span className="text-[11px] text-gray-600 tabular-nums">
                          {new Date(u.createdAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </td>
                      <td className="px-2 py-2.5">
                        <button
                          onClick={() => setDeleteTarget(u)}
                          disabled={u._id === currentUser?._id}
                          className="h-6 w-6 rounded flex items-center justify-center text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all disabled:hidden"
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
