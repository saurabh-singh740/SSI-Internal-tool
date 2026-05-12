import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  FolderKanban, CheckCircle, PauseCircle, AlertTriangle,
  TrendingUp, Plus, ArrowRight,
} from 'lucide-react';
import api from '../api/axios';
import { Project, ProjectStats } from '../types';
import Header from '../components/layout/Header';

type FilterKey = 'all' | 'ACTIVE' | 'ON_HOLD' | 'nearLimit';

const STATUS_CFG = {
  ACTIVE:  { dot: '#4ade80', bg: 'rgba(74,222,128,0.12)',  text: '#4ade80',  border: 'rgba(74,222,128,0.2)'  },
  CLOSED:  { dot: '#6b7280', bg: 'rgba(107,114,128,0.12)', text: '#9ca3af',  border: 'rgba(107,114,128,0.2)' },
  ON_HOLD: { dot: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  text: '#fbbf24',  border: 'rgba(251,191,36,0.2)'  },
} as const;

function StatusDot({ status }: { status: string }) {
  const c = STATUS_CFG[status as keyof typeof STATUS_CFG] ?? STATUS_CFG.CLOSED;
  return <span className="h-1.5 w-1.5 rounded-full inline-block" style={{ background: c.dot }} />;
}

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CFG[status as keyof typeof STATUS_CFG] ?? STATUS_CFG.CLOSED;
  const label = status === 'ON_HOLD' ? 'On Hold' : status.charAt(0) + status.slice(1).toLowerCase();
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide leading-none"
          style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
      {label}
    </span>
  );
}

function MiniSparkline({ projects }: { projects: Project[] }) {
  if (!projects.length) return null;
  const buckets = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return { label: d.toLocaleDateString('en', { weekday: 'short' }), count: 0 };
  });
  projects.forEach(p => {
    if (!p.startDate) return;
    const ms = Date.now() - new Date(p.startDate).getTime();
    const days = Math.floor(ms / 86400000);
    if (days >= 0 && days < 7) buckets[6 - days].count++;
  });
  const max = Math.max(...buckets.map(b => b.count), 1);
  const W = 6, GAP = 2, H = 24;
  return (
    <svg width={buckets.length * (W + GAP)} height={H}>
      {buckets.map((b, i) => {
        const h = Math.max(2, Math.round((b.count / max) * H));
        return (
          <rect key={i} x={i * (W + GAP)} y={H - h} width={W} height={h} rx={1}
                fill={`rgba(99,102,241,${0.3 + (b.count / max) * 0.6})`}>
            <title>{b.label}: {b.count}</title>
          </rect>
        );
      })}
    </svg>
  );
}

export default function Dashboard() {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  const { data: stats, isLoading: statsLoading } = useQuery<ProjectStats>({
    queryKey: ['dashboard-stats'],
    queryFn:  () => api.get('/projects/stats/summary').then(r => r.data.stats),
  });

  const { data: allProjects = [], isLoading: listLoading } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn:  () => api.get('/projects').then(r => r.data.projects as Project[]),
  });

  const displayProjects = useMemo(() => {
    if (activeFilter === 'nearLimit') return allProjects.filter(p => p.isNearLimit);
    if (activeFilter === 'ACTIVE')    return allProjects.filter(p => p.status === 'ACTIVE');
    if (activeFilter === 'ON_HOLD')   return allProjects.filter(p => p.status === 'ON_HOLD');
    return allProjects.slice(0, 8);
  }, [allProjects, activeFilter]);

  const loading = statsLoading || listLoading;

  type PillDef = { label: string; value: number; icon: React.ElementType; color: string; key: FilterKey };
  const pills: PillDef[] = [
    { label: 'Total',      value: stats?.total    ?? 0, icon: FolderKanban,  color: '#6366f1', key: 'all'      },
    { label: 'Active',     value: stats?.active   ?? 0, icon: CheckCircle,   color: '#4ade80', key: 'ACTIVE'   },
    { label: 'On Hold',    value: stats?.onHold   ?? 0, icon: PauseCircle,   color: '#fbbf24', key: 'ON_HOLD'  },
    { label: 'Near Limit', value: stats?.nearLimit ?? 0, icon: AlertTriangle, color: '#f87171', key: 'nearLimit' },
  ];

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#050816' }}>
      <Header
        title="Dashboard"
        subtitle="Project portfolio overview"
      />

      <div className="px-4 pt-4 space-y-4">

        {/* ── Stat pills ──────────────────────────────────────────────────── */}
        <div
          className="rounded-xl px-4 py-3"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 text-indigo-400" />
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Portfolio</span>
            </div>
            <div className="flex items-center gap-3">
              <MiniSparkline projects={allProjects} />
              <span className="text-[9px] text-gray-700">7-day starts</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {pills.map(({ label, value, icon: Icon, color, key }) => {
              const active = activeFilter === key;
              return (
                <button
                  key={key}
                  onClick={() => setActiveFilter(key)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all"
                  style={{
                    background: active ? `${color}22` : 'rgba(255,255,255,0.04)',
                    border:     `1px solid ${active ? color + '55' : 'rgba(255,255,255,0.07)'}`,
                  }}
                >
                  <Icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color }} />
                  {statsLoading
                    ? <span className="h-4 w-6 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.1)' }} />
                    : <span className="text-sm font-bold text-white tabular-nums">{value}</span>
                  }
                  <span className="text-[10px] text-gray-500">{label}</span>
                  {active && <span className="text-[9px]" style={{ color }}>▼</span>}
                </button>
              );
            })}

            {/* Project distribution mini-bars */}
            {!statsLoading && allProjects.length > 0 && (
              <div className="ml-auto flex items-center gap-3">
                {['ACTIVE','ON_HOLD','CLOSED'].map(s => {
                  const cnt = allProjects.filter(p => p.status === s).length;
                  const pct = allProjects.length ? (cnt / allProjects.length) * 100 : 0;
                  const cfg = STATUS_CFG[s as keyof typeof STATUS_CFG];
                  return (
                    <div key={s} className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: cfg.dot }} />
                      <div className="w-12 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: cfg.dot }} />
                      </div>
                      <span className="text-[9px] text-gray-600">{cnt}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Project table ────────────────────────────────────────────────── */}
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          {/* Table header */}
          <div
            className="flex items-center justify-between px-4 py-2.5"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="flex items-center gap-2">
              <FolderKanban className="h-3.5 w-3.5 text-indigo-400" />
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                {activeFilter === 'all'       ? 'Recent Projects'
                : activeFilter === 'ACTIVE'   ? 'Active Projects'
                : activeFilter === 'ON_HOLD'  ? 'On Hold Projects'
                : 'Near Hour Limit'}
              </span>
              {!loading && (
                <span className="text-[10px] text-gray-700">{displayProjects.length} shown</span>
              )}
            </div>
            <Link
              to="/projects"
              className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-200 transition-colors"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {loading ? (
            <div className="p-4 space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-9 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
              ))}
            </div>
          ) : displayProjects.length === 0 ? (
            <div className="py-12 text-center">
              <FolderKanban className="h-8 w-8 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm font-medium">No projects found</p>
              <p className="text-gray-700 text-xs mt-1">
                {activeFilter === 'all' ? 'Create your first project to get started.' : 'No projects match this filter.'}
              </p>
              {activeFilter === 'all' && (
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
                    <th className="px-3 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest w-32">Utilization</th>
                    <th className="px-3 py-2 text-center text-[9px] font-semibold text-gray-700 uppercase tracking-widest w-10 hidden md:table-cell">Eng</th>
                    <th className="px-2 py-2 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {displayProjects.map(p => {
                    const util = p.totalAuthorizedHours > 0
                      ? Math.round((p.hoursUsed / p.totalAuthorizedHours) * 100) : 0;
                    const barColor = util >= 90 ? '#ef4444' : util >= 70 ? '#f59e0b' : '#4ade80';
                    return (
                      <tr
                        key={p._id}
                        className="group transition-colors"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <StatusDot status={p.status} />
                            <span className="text-sm font-medium text-gray-200 truncate">{p.name}</span>
                            {p.isNearLimit && <AlertTriangle className="h-3 w-3 text-amber-400 flex-shrink-0" />}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <code className="text-[10px] font-mono text-gray-500">{p.code}</code>
                        </td>
                        <td className="px-3 py-2.5 hidden sm:table-cell">
                          <span className="text-xs text-gray-500 truncate block max-w-[120px]">{p.clientName || '—'}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusBadge status={p.status} />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1 rounded-full max-w-[64px]" style={{ background: 'rgba(255,255,255,0.08)' }}>
                              <div className="h-full rounded-full" style={{ width: `${Math.min(util, 100)}%`, background: barColor }} />
                            </div>
                            <span className="text-[10px] font-mono tabular-nums" style={{ color: barColor }}>{util}%</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-center hidden md:table-cell">
                          <span className="text-xs text-gray-600">{p.engineers?.length ?? 0}</span>
                        </td>
                        <td className="px-2 py-2.5">
                          <Link
                            to={`/projects/${p._id}`}
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <ArrowRight className="h-3.5 w-3.5 text-indigo-400" />
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
