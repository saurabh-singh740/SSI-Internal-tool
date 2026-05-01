import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FolderKanban, CheckCircle, PauseCircle, AlertTriangle, TrendingUp, Plus, ArrowRight } from 'lucide-react';
import api from '../api/axios';
import { Project, ProjectStats } from '../types';
import Header from '../components/layout/Header';
import { clsx } from 'clsx';

type FilterKey = 'all' | 'ACTIVE' | 'ON_HOLD' | 'nearLimit';

const statusBadge: Record<string, string> = {
  ACTIVE:  'badge badge-green',
  CLOSED:  'badge badge-gray',
  ON_HOLD: 'badge badge-yellow',
};
const statusLabel: Record<string, string> = {
  ACTIVE: 'Active', CLOSED: 'Closed', ON_HOLD: 'On Hold',
};

const filterLabel: Record<FilterKey, string> = {
  all:       'Recent Projects',
  ACTIVE:    'Active Projects',
  ON_HOLD:   'On Hold Projects',
  nearLimit: 'Near Hour Limit',
};

export default function Dashboard() {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  const { data: stats, isLoading: statsLoading } = useQuery<ProjectStats>({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get('/projects/stats/summary').then(r => r.data.stats),
  });

  // Single fetch for all projects — shared cache key with the Projects page so
  // navigating Dashboard → Projects is instant (no second network request).
  const { data: allProjects = [], isLoading: listLoading } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then(r => r.data.projects as Project[]),
  });

  // Client-side filtering — zero extra network round-trips when the user clicks
  // a stat card.  Previously each filter click triggered a new API call.
  const displayProjects = useMemo(() => {
    if (activeFilter === 'nearLimit') return allProjects.filter(p => p.isNearLimit);
    if (activeFilter === 'ACTIVE')    return allProjects.filter(p => p.status === 'ACTIVE');
    if (activeFilter === 'ON_HOLD')   return allProjects.filter(p => p.status === 'ON_HOLD');
    // 'all' — show the 5 most-recently-created projects
    return allProjects.slice(0, 5);
  }, [allProjects, activeFilter]);

  const loading = statsLoading || listLoading;

  const statCards: {
    label: string;
    value: number;
    icon: React.ElementType;
    iconClass: string;
    valueClass: string;
    filterKey: FilterKey;
    ringClass: string;
  }[] = [
    {
      label: 'Total Projects',
      value: stats?.total ?? 0,
      icon: FolderKanban,
      iconClass: 'text-brand-400 bg-brand-600/10',
      valueClass: 'text-ink-100',
      filterKey: 'all',
      ringClass: 'ring-brand-500/40',
    },
    {
      label: 'Active',
      value: stats?.active ?? 0,
      icon: CheckCircle,
      iconClass: 'text-emerald-400 bg-emerald-500/10',
      valueClass: 'text-emerald-400',
      filterKey: 'ACTIVE',
      ringClass: 'ring-emerald-500/40',
    },
    {
      label: 'On Hold',
      value: stats?.onHold ?? 0,
      icon: PauseCircle,
      iconClass: 'text-amber-400 bg-amber-500/10',
      valueClass: 'text-amber-400',
      filterKey: 'ON_HOLD',
      ringClass: 'ring-amber-500/40',
    },
    {
      label: 'Near Hour Limit',
      value: stats?.nearLimit ?? 0,
      icon: AlertTriangle,
      iconClass: 'text-red-400 bg-red-500/10',
      valueClass: 'text-red-400',
      filterKey: 'nearLimit',
      ringClass: 'ring-red-500/40',
    },
  ];

  return (
    <div>
      <Header
        title="Dashboard"
        subtitle="Overview of all projects"
      />

      <div className="page-content">
        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map(({ label, value, icon: Icon, iconClass, valueClass, filterKey, ringClass }) => {
            const isActive = activeFilter === filterKey;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setActiveFilter(filterKey)}
                className={clsx(
                  'stat-card text-left w-full transition-all duration-150',
                  'hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm',
                  'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                  isActive && ['ring-2', ringClass, 'shadow-md'],
                )}
              >
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[11px] font-semibold text-ink-400 uppercase tracking-widest">{label}</p>
                  <div className={clsx('h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0', iconClass)}>
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
                <p className={clsx('text-3xl font-bold tabular-nums', statsLoading ? 'skeleton w-12 h-8' : valueClass)}>
                  {statsLoading ? '' : value}
                </p>
                {isActive && (
                  <p className="mt-2 text-[10px] font-medium text-ink-500 uppercase tracking-wide">
                    Showing below ↓
                  </p>
                )}
              </button>
            );
          })}
        </div>

        {/* Filtered / Recent Projects */}
        <div className="card overflow-hidden">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-ink-400" />
              <h3 className="text-sm font-semibold text-ink-100">{filterLabel[activeFilter]}</h3>
            </div>
            <Link to="/projects" className="btn-ghost text-xs py-1.5 px-2.5">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {listLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="skeleton h-10 w-full" />
              ))}
            </div>
          ) : displayProjects.length === 0 ? (
            <div className="empty-state">
              <FolderKanban className="h-10 w-10 text-ink-500 mb-3" />
              <h3 className="text-sm font-semibold text-ink-100">No projects found</h3>
              <p className="text-sm text-ink-300 mb-4">
                {activeFilter === 'all'
                  ? 'Create your first project to get started.'
                  : `No projects match the "${filterLabel[activeFilter]}" filter.`}
              </p>
              {activeFilter === 'all' && (
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
                    <th>Client</th>
                    <th>Status</th>
                    <th>Utilization</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {displayProjects.map((p) => {
                    const util = p.totalAuthorizedHours > 0
                      ? Math.round((p.hoursUsed / p.totalAuthorizedHours) * 100)
                      : 0;
                    return (
                      <tr key={p._id}>
                        <td className="font-medium text-ink-100">{p.name}</td>
                        <td className="font-mono text-xs text-ink-400">{p.code}</td>
                        <td className="text-ink-300">{p.clientName || '—'}</td>
                        <td>
                          <span className={statusBadge[p.status]}>
                            {statusLabel[p.status]}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-ink-600 rounded-full max-w-[72px]">
                              <div
                                className={clsx('h-1.5 rounded-full transition-all', util >= 90 ? 'bg-red-500' : util >= 70 ? 'bg-amber-500' : 'bg-emerald-500')}
                                style={{ width: `${Math.min(util, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs tabular-nums text-ink-400 w-8">{util}%</span>
                          </div>
                        </td>
                        <td>
                          <Link to={`/projects/${p._id}`} className="text-brand-400 hover:text-brand-300 text-xs font-medium">
                            View →
                          </Link>
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