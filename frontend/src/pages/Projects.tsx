import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, Eye, Pencil, Trash2, AlertTriangle, FolderKanban,
  X, RefreshCw, ArrowRight, Clock, Users,
} from 'lucide-react';
import api from '../api/axios';
import { Project } from '../types';
import ConfirmModal from '../components/ui/ConfirmModal';
import Header from '../components/layout/Header';
import { useAuth } from '../context/AuthContext';
import { clsx } from 'clsx';

// ── Visual config ──────────────────────────────────────────────────────────────

const STATUS_CFG = {
  ACTIVE:  { dot: '#4ade80', bg: 'rgba(74,222,128,0.12)',  text: '#4ade80',  border: 'rgba(74,222,128,0.2)'  },
  CLOSED:  { dot: '#6b7280', bg: 'rgba(107,114,128,0.12)', text: '#9ca3af',  border: 'rgba(107,114,128,0.2)' },
  ON_HOLD: { dot: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  text: '#fbbf24',  border: 'rgba(251,191,36,0.2)'  },
} as const;

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CFG[status as keyof typeof STATUS_CFG] ?? STATUS_CFG.CLOSED;
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide leading-none"
          style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
      {status === 'ON_HOLD' ? 'On Hold' : status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

const PHASE_COLOR: Record<string, string> = {
  PLANNING: '#60a5fa', EXECUTION: '#a78bfa', DELIVERY: '#4ade80', MAINTENANCE: '#fb923c',
};

// ── Main page ──────────────────────────────────────────────────────────────────

export default function Projects() {
  const { user }       = useAuth();
  const queryClient    = useQueryClient();

  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatus]       = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [debouncedSearch, setDebounced] = useState('');
  const [selected, setSelected]         = useState<Project | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebounced(search), 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [search]);

  const { data: projects = [], isLoading, refetch } = useQuery<Project[]>({
    queryKey: ['projects', debouncedSearch, statusFilter],
    queryFn: () => {
      const p = new URLSearchParams();
      if (debouncedSearch) p.set('search', debouncedSearch);
      if (statusFilter)    p.set('status', statusFilter);
      return api.get(`/projects?${p}`).then(r => r.data.projects as Project[]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/projects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget._id, { onSettled: () => setDeleteTarget(null) });
  };

  const hasFilter = !!(search || statusFilter);

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#050816' }}>
      <Header
        title="Projects"
        subtitle={isLoading ? undefined : `${projects.length} project${projects.length !== 1 ? 's' : ''}`}
        actions={
          user?.role === 'ADMIN' ? (
            <Link
              to="/projects/create"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
              style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed)' }}
            >
              <Plus className="h-3.5 w-3.5" /> New Project
            </Link>
          ) : undefined
        }
      />

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete project"
        description={`Delete "${deleteTarget?.name}"? All associated data will be permanently removed.`}
        confirmLabel="Delete Project"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* ── Sticky toolbar ─────────────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-30 px-4 py-2.5 flex flex-wrap items-center gap-2"
        style={{
          background:     'rgba(5,8,22,0.92)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom:   '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-600 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search projects…"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs text-white placeholder-gray-700 outline-none"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
          />
        </div>

        <select
          value={statusFilter}
          onChange={e => setStatus(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg text-xs text-gray-300 outline-none"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
        >
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="ON_HOLD">On Hold</option>
          <option value="CLOSED">Closed</option>
        </select>

        {hasFilter && (
          <button
            onClick={() => { setSearch(''); setStatus(''); }}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-gray-700">
            {projects.length > 0 && `${projects.length} records`}
          </span>
          <button
            onClick={() => refetch()}
            className="text-gray-600 hover:text-gray-300 transition-colors"
          >
            <RefreshCw className={clsx('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* ── Main content with side drawer ──────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 relative">
        <div
          className="flex-1 min-w-0 transition-all duration-200"
          style={{ marginRight: selected ? 'min(380px, 100vw)' : 0 }}
        >
          <div className="px-4 pt-4">
            <div
              className="rounded-xl overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              {isLoading ? (
                <div className="p-4 space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
                  ))}
                </div>
              ) : projects.length === 0 ? (
                <div className="py-16 text-center">
                  <FolderKanban className="h-8 w-8 text-gray-700 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm font-medium">No projects found</p>
                  <p className="text-gray-700 text-xs mt-1">
                    {hasFilter ? 'Try adjusting your filters.' : 'Create your first project to get started.'}
                  </p>
                  {user?.role === 'ADMIN' && !hasFilter && (
                    <Link
                      to="/projects/create"
                      className="inline-flex items-center gap-1 mt-3 text-xs text-indigo-400 hover:text-indigo-200"
                    >
                      <Plus className="h-3 w-3" /> New Project
                    </Link>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px]">
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.015)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <th className="px-4 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest">Project</th>
                        <th className="px-3 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest w-20">Code</th>
                        <th className="px-3 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest hidden sm:table-cell">Client</th>
                        <th className="px-3 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest w-16">Status</th>
                        <th className="px-3 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest w-36">Utilization</th>
                        <th className="px-3 py-2 text-center text-[9px] font-semibold text-gray-700 uppercase tracking-widest w-10 hidden md:table-cell">Eng</th>
                        <th className="px-2 py-2 w-20" />
                      </tr>
                    </thead>
                    <tbody>
                      {projects.map(p => {
                        const util = p.totalAuthorizedHours > 0
                          ? Math.round((p.hoursUsed / p.totalAuthorizedHours) * 100) : 0;
                        const barColor = util >= 90 ? '#ef4444' : util >= 70 ? '#f59e0b' : '#4ade80';
                        const isSel = selected?._id === p._id;
                        return (
                          <tr
                            key={p._id}
                            onClick={() => setSelected(prev => prev?._id === p._id ? null : p)}
                            className="group cursor-pointer transition-colors"
                            style={{
                              borderBottom: '1px solid rgba(255,255,255,0.04)',
                              background: isSel ? 'rgba(99,102,241,0.06)' : 'transparent',
                              borderLeft: `2px solid ${isSel ? '#6366f1' : 'transparent'}`,
                            }}
                            onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; }}
                            onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
                          >
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-sm font-medium text-gray-200 truncate">{p.name}</span>
                                {p.isNearLimit && <AlertTriangle className="h-3 w-3 text-amber-400 flex-shrink-0" />}
                              </div>
                              <div className="flex items-center gap-1 mt-0.5">
                                <span className="text-[9px] font-medium" style={{ color: PHASE_COLOR[p.phase] ?? '#9ca3af' }}>
                                  {p.phase}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <code className="text-[10px] font-mono text-gray-500">{p.code}</code>
                            </td>
                            <td className="px-3 py-2.5 hidden sm:table-cell">
                              <span className="text-xs text-gray-500 truncate block max-w-[120px]">{p.clientName || '—'}</span>
                            </td>
                            <td className="px-3 py-2.5"><StatusBadge status={p.status} /></td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                                  <div className="h-full rounded-full" style={{ width: `${Math.min(util, 100)}%`, background: barColor }} />
                                </div>
                                <span className="text-[10px] font-mono tabular-nums w-8 text-right" style={{ color: barColor }}>{util}%</span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-center hidden md:table-cell">
                              <span className="text-xs text-gray-600">{p.engineers?.length ?? 0}</span>
                            </td>
                            <td className="px-2 py-2.5">
                              <div
                                className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={e => e.stopPropagation()}
                              >
                                <Link
                                  to={`/projects/${p._id}`}
                                  className="h-6 w-6 rounded flex items-center justify-center text-gray-500 hover:text-indigo-400 transition-colors"
                                  title="View"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </Link>
                                {user?.role === 'ADMIN' && (
                                  <>
                                    <Link
                                      to={`/projects/${p._id}/edit`}
                                      className="h-6 w-6 rounded flex items-center justify-center text-gray-500 hover:text-emerald-400 transition-colors"
                                      title="Edit"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Link>
                                    <button
                                      onClick={() => setDeleteTarget(p)}
                                      className="h-6 w-6 rounded flex items-center justify-center text-gray-500 hover:text-red-400 transition-colors"
                                      title="Delete"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Quick-view drawer ──────────────────────────────────────────────── */}
        {selected && (
          <div
            className="fixed right-0 top-0 bottom-0 z-50 flex flex-col overflow-hidden"
            style={{
              width: 'min(380px, 100vw)',
              background: 'rgba(7,6,24,0.97)',
              borderLeft: '1px solid rgba(255,255,255,0.09)',
              backdropFilter: 'blur(24px)',
            }}
          >
            {/* Drawer header */}
            <div className="px-5 py-4 flex-shrink-0 flex items-start justify-between gap-3"
                 style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-100 truncate">{selected.name}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <StatusBadge status={selected.status} />
                  <code className="text-[10px] font-mono text-gray-600">{selected.code}</code>
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="h-6 w-6 rounded flex items-center justify-center text-gray-500 hover:text-white flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.06)' }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* Utilization */}
              {(() => {
                const util = selected.totalAuthorizedHours > 0
                  ? Math.round((selected.hoursUsed / selected.totalAuthorizedHours) * 100) : 0;
                const barColor = util >= 90 ? '#ef4444' : util >= 70 ? '#f59e0b' : '#4ade80';
                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-semibold text-gray-600 uppercase tracking-widest">Hour Utilization</span>
                      <span className="text-[10px] font-mono tabular-nums" style={{ color: barColor }}>{util}%</span>
                    </div>
                    <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(util, 100)}%`, background: barColor }} />
                    </div>
                    <div className="flex justify-between text-[9px] text-gray-700">
                      <span>{selected.hoursUsed}h used</span>
                      <span>{selected.totalAuthorizedHours}h authorized</span>
                    </div>
                  </div>
                );
              })()}

              {/* Stat pills */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Engineers', value: selected.engineers?.length ?? 0, icon: Users, color: '#60a5fa' },
                  { label: 'Phase', value: selected.phase.replace(/_/g, ' '), icon: Clock, color: PHASE_COLOR[selected.phase] ?? '#9ca3af' },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className="px-3 py-2 rounded-lg"
                       style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon className="h-3 w-3 flex-shrink-0" style={{ color }} />
                      <span className="text-[9px] text-gray-600 uppercase tracking-widest">{label}</span>
                    </div>
                    <p className="text-sm font-bold text-gray-200">{value}</p>
                  </div>
                ))}
              </div>

              {/* Info rows */}
              <div className="space-y-0">
                {[
                  { label: 'Client', value: selected.clientName ?? '—' },
                  { label: 'Company', value: selected.clientCompany ?? '—' },
                  { label: 'Category', value: selected.category ?? '—' },
                  { label: 'Billing', value: `${selected.currency} ${selected.hourlyRate}/hr` },
                  { label: 'Payment Terms', value: selected.paymentTerms?.replace('_', ' ') ?? '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between py-2"
                       style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className="text-[10px] text-gray-600">{label}</span>
                    <span className="text-[10px] text-gray-300 text-right max-w-[180px] truncate">{value}</span>
                  </div>
                ))}
              </div>

              {/* Engineers list */}
              {(selected.engineers?.length ?? 0) > 0 && (
                <div>
                  <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-widest mb-2">Engineers</p>
                  <div className="space-y-1.5">
                    {selected.engineers?.slice(0, 5).map((e, i) => {
                      const eng = e.engineer as any;
                      return (
                        <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
                             style={{ background: 'rgba(255,255,255,0.03)' }}>
                          <div className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                               style={{ background: 'rgba(99,102,241,0.3)' }}>
                            {(eng?.name ?? '?').charAt(0).toUpperCase()}
                          </div>
                          <span className="text-xs text-gray-300 truncate flex-1">{eng?.name ?? '—'}</span>
                          <span className="text-[9px] text-gray-600">{e.allocationPercentage}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="px-5 py-3 flex gap-2 flex-shrink-0"
                 style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              <Link
                to={`/projects/${selected._id}`}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium text-white"
                style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)' }}
              >
                <ArrowRight className="h-3.5 w-3.5" /> Open Project
              </Link>
              {user?.role === 'ADMIN' && (
                <Link
                  to={`/projects/${selected._id}/edit`}
                  className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white transition-colors"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
