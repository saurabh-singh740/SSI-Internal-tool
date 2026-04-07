import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, SlidersHorizontal, Eye, Pencil, Trash2, AlertTriangle, FolderKanban } from 'lucide-react';
import api from '../api/axios';
import { Project } from '../types';
import ConfirmModal from '../components/ui/ConfirmModal';
import Header from '../components/layout/Header';
import { useAuth } from '../context/AuthContext';
import { clsx } from 'clsx';

const statusBadge: Record<string, string> = {
  ACTIVE:  'badge badge-green',
  CLOSED:  'badge badge-gray',
  ON_HOLD: 'badge badge-yellow',
};
const typeBadge: Record<string, string> = {
  CLIENT_PROJECT: 'badge badge-blue',
  INTERNAL:       'badge badge-purple',
  SUPPORT:        'badge badge-orange',
};
const typeLabel: Record<string, string> = {
  CLIENT_PROJECT: 'Client', INTERNAL: 'Internal', SUPPORT: 'Support',
};

export default function Projects() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch]       = useState('');
  const [statusFilter, setStatus] = useState('');
  const [typeFilter, setType]     = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  // Debounce the search term so the query key only changes 300 ms after typing stops.
  // Status/type selects update immediately (no debounce needed — single click).
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  // ── Fetch projects ────────────────────────────────────────────────────────
  const { data: projects = [], isLoading: loading } = useQuery<Project[]>({
    queryKey: ['projects', debouncedSearch, statusFilter, typeFilter],
    queryFn: () => {
      const p = new URLSearchParams();
      if (debouncedSearch) p.set('search', debouncedSearch);
      if (statusFilter)    p.set('status', statusFilter);
      if (typeFilter)      p.set('type',   typeFilter);
      return api.get(`/projects?${p}`).then(r => r.data.projects as Project[]);
    },
  });

  // ── Delete mutation ───────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/projects/${id}`),
    onSuccess: () => {
      // Invalidate all project list variants so every active query refreshes
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      // Also invalidate dashboard which shows recent projects + stats
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-recent-projects'] });
    },
  });

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget._id, {
      onSettled: () => setDeleteTarget(null),
    });
  };

  return (
    <div>
      <Header
        title="Projects"
        subtitle={loading ? undefined : `${projects.length} project${projects.length !== 1 ? 's' : ''}`}
        actions={
          user?.role === 'ADMIN' ? (
            <Link to="/projects/create" className="btn-primary text-xs py-1.5 px-3">
              <Plus className="h-3.5 w-3.5" /> New Project
            </Link>
          ) : undefined
        }
      />

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete project"
        description={`Delete "${deleteTarget?.name}"? All associated data will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete Project"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />

      <div className="page-content">
        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-0 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400 pointer-events-none" />
            <input
              id="projects-search"
              name="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input pl-9"
              placeholder="Search projects…"
            />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <SlidersHorizontal className="h-4 w-4 text-ink-400" />
            <select id="projects-status-filter" name="statusFilter" value={statusFilter} onChange={(e) => setStatus(e.target.value)} className="form-select w-auto text-xs py-2">
              <option value="">All Status</option>
              <option value="ACTIVE">Active</option>
              <option value="ON_HOLD">On Hold</option>
              <option value="CLOSED">Closed</option>
            </select>
            <select id="projects-type-filter" name="typeFilter" value={typeFilter} onChange={(e) => setType(e.target.value)} className="form-select w-auto text-xs py-2">
              <option value="">All Types</option>
              <option value="CLIENT_PROJECT">Client</option>
              <option value="INTERNAL">Internal</option>
              <option value="SUPPORT">Support</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="card overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-10 w-full" />)}
            </div>
          ) : projects.length === 0 ? (
            <div className="empty-state">
              <FolderKanban className="h-10 w-10 text-ink-500 mb-3" />
              <h3 className="text-sm font-semibold text-ink-100">No projects found</h3>
              <p className="text-sm text-ink-300 mb-4">
                {search || statusFilter || typeFilter ? 'Try adjusting your filters.' : 'Create your first project to get started.'}
              </p>
              {user?.role === 'ADMIN' && !search && !statusFilter && !typeFilter && (
                <Link to="/projects/create" className="btn-primary text-xs">
                  <Plus className="h-3.5 w-3.5" /> New Project
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Code</th>
                    <th>Type</th>
                    <th>Client</th>
                    <th>Status</th>
                    <th>Utilization</th>
                    <th className="text-center">Engineers</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => {
                    const util = p.totalAuthorizedHours > 0
                      ? Math.round((p.hoursUsed / p.totalAuthorizedHours) * 100)
                      : 0;
                    return (
                      <tr key={p._id}>
                        <td>
                          <div className="flex items-center gap-1.5 font-medium text-ink-100">
                            {p.name ?? 'Untitled Project'}
                            {p.isNearLimit && (
                              <span title="Near hour limit">
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="font-mono text-xs text-ink-400">{p.code}</td>
                        <td><span className={typeBadge[p.type]}>{typeLabel[p.type]}</span></td>
                        <td className="text-ink-300">{p.clientName || '—'}</td>
                        <td><span className={statusBadge[p.status]}>{p.status.replace('_', ' ')}</span></td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-white/10 rounded-full">
                              <div
                                className={clsx('h-1.5 rounded-full transition-all', util >= 90 ? 'bg-red-500' : util >= 70 ? 'bg-amber-500' : 'bg-emerald-500')}
                                style={{ width: `${Math.min(util, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs tabular-nums text-ink-400 w-8">{util}%</span>
                          </div>
                        </td>
                        <td className="text-center text-ink-300">{p.engineers?.length ?? 0}</td>
                        <td>
                          <div className="flex items-center gap-0.5">
                            <Link
                              to={`/projects/${p._id}`}
                              className="btn-icon h-7 w-7 text-ink-400 hover:text-brand-400 hover:bg-brand-500/10"
                              title="View"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Link>
                            {user?.role === 'ADMIN' && (
                              <>
                                <Link
                                  to={`/projects/${p._id}/edit`}
                                  className="btn-icon h-7 w-7 text-ink-400 hover:text-emerald-400 hover:bg-emerald-500/10"
                                  title="Edit"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Link>
                                <button
                                  onClick={() => setDeleteTarget(p)}
                                  disabled={deleteMutation.isPending && deleteTarget?._id === p._id}
                                  className="btn-icon h-7 w-7 text-ink-400 hover:text-red-400 hover:bg-red-500/10"
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
  );
}