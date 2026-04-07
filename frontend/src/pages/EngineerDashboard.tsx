import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FolderKanban, Clock, CheckCircle, TrendingUp,
  ChevronRight, AlertTriangle, Loader2, BarChart2, X, DollarSign,
} from 'lucide-react';
import api from '../api/axios';
import { Project, Payment } from '../types';
import Header from '../components/layout/Header';
import { useAuth } from '../context/AuthContext';
import { clsx } from 'clsx';

const CURRENCY_SYMBOL: Record<string, string> = { USD: '$', INR: '₹', EUR: '€' };

const PAYMENT_STATUS_STYLE: Record<string, { label: string; className: string }> = {
  received: { label: 'Received', className: 'badge badge-green' },
  pending:  { label: 'Pending',  className: 'badge badge-yellow' },
  overdue:  { label: 'Overdue',  className: 'badge badge-red' },
  partial:  { label: 'Partial',  className: 'badge badge-yellow' },
};

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const statusBadge: Record<string, string> = {
  ACTIVE:  'badge badge-green',
  CLOSED:  'badge badge-gray',
  ON_HOLD: 'badge badge-yellow',
};

type FilterKey = 'active' | 'completed' | 'hours' | 'remaining';

interface MonthStat { month: number; hours: number; }
interface ProjectMonthHours { projectId: string; projectName: string; hours: number; }

const PANEL_TITLE: Record<FilterKey, string> = {
  active:    'Active Projects',
  completed: 'Completed Projects',
  hours:     'Hours Logged This Month',
  remaining: 'Remaining Authorized Hours',
};

export default function EngineerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [projects,    setProjects]    = useState<Project[]>([]);
  const [monthStats,  setMonthStats]  = useState<MonthStat[]>([]);
  const [projectMonthHours, setProjectMonthHours] = useState<ProjectMonthHours[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [tsLoading,   setTsLoading]   = useState(false);
  const [payments,        setPayments]        = useState<Payment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  // ── Interactive filter state ────────────────────────────────────────────────
  const [activeFilter, setActiveFilter] = useState<FilterKey | null>(null);

  const year = new Date().getFullYear();
  const currentMonth = new Date().getMonth();

  useEffect(() => {
    api.get('/projects')
      .then((r) => {
        const all: Project[] = r.data.projects || r.data || [];
        const mine = all.filter((p) =>
          p.engineers?.some((e: any) => String(e.engineer?._id || e.engineer) === user?._id)
        );
        setProjects(mine);

        if (user?._id) {
          setTsLoading(true);
          api.get(`/timesheets/engineer/${user._id}/${year}`)
            .then((r) => {
              const timesheets: any[] = r.data.timesheets || [];

              // Monthly totals (existing logic — unchanged)
              const monthMap: Record<number, number> = {};
              timesheets.forEach((ts) => {
                (ts.months || []).forEach((m: any) => {
                  monthMap[m.monthIndex] = (monthMap[m.monthIndex] || 0) + (m.monthlyTotal || 0);
                });
              });
              setMonthStats(
                Object.entries(monthMap)
                  .map(([m, h]) => ({ month: Number(m), hours: Math.round(h * 10) / 10 }))
                  .sort((a, b) => a.month - b.month),
              );

              // Per-project hours for current month (used by "Hours Logged" filter view)
              // ts.project may be a populated object OR a plain string ID depending on the API response
              const perProject: ProjectMonthHours[] = timesheets
                .map((ts) => {
                  const monthEntry = (ts.months || []).find((m: any) => m.monthIndex === currentMonth);
                  const hours = monthEntry?.monthlyTotal ?? 0;
                  if (!hours) return null;

                  const isPopulated = ts.project && typeof ts.project === 'object';
                  const projectId: string   = isPopulated ? (ts.project._id ?? '') : String(ts.project ?? '');
                  const projectName: string = isPopulated
                    ? (ts.project.name ?? projectId)
                    : (mine.find((p) => p._id === ts.project)?.name ?? String(ts.project ?? 'Unknown'));

                  return {
                    projectId,
                    projectName,
                    hours: Math.round(hours * 10) / 10,
                  };
                })
                .filter(Boolean) as ProjectMonthHours[];
              setProjectMonthHours(perProject);
            })
            .catch(() => {})
            .finally(() => setTsLoading(false));
        }
      })
      .finally(() => setLoading(false));
  }, [user?._id, year]);

  // ── Fetch payments for engineer's projects ──────────────────────────────────
  useEffect(() => {
    if (!user?._id) return;
    setPaymentsLoading(true);
    api.get('/payments/my')
      .then((r) => setPayments(r.data.payments || []))
      .catch(() => {})
      .finally(() => setPaymentsLoading(false));
  }, [user?._id]);

  // ── Derived stats ───────────────────────────────────────────────────────────
  const active    = projects.filter((p) => p.status === 'ACTIVE').length;
  const completed = projects.filter((p) => p.status === 'CLOSED').length;
  const totalAuth = projects.reduce((s, p) => s + (p.totalAuthorizedHours || 0), 0);
  const totalUsed = projects.reduce((s, p) => s + (p.hoursUsed || 0), 0);
  const remaining = Math.max(0, totalAuth - totalUsed);
  const thisMonthHours = monthStats.find((m) => m.month === currentMonth)?.hours ?? 0;

  const stats: {
    label:     string;
    value:     string | number;
    icon:      React.ElementType;
    iconClass: string;
    valueClass: string;
    filterKey: FilterKey;
    ringClass: string;
  }[] = [
    {
      label:      'Active Projects',
      value:      active,
      icon:       FolderKanban,
      iconClass:  'bg-blue-500/15 text-blue-400',
      valueClass: 'text-ink-100',
      filterKey:  'active',
      ringClass:  'ring-blue-400',
    },
    {
      label:      'Completed Projects',
      value:      completed,
      icon:       CheckCircle,
      iconClass:  'bg-emerald-500/15 text-emerald-400',
      valueClass: 'text-emerald-400',
      filterKey:  'completed',
      ringClass:  'ring-emerald-400',
    },
    {
      label:      `Hours Logged (${MONTH_NAMES[currentMonth]})`,
      value:      `${thisMonthHours}h`,
      icon:       Clock,
      iconClass:  'bg-purple-500/15 text-purple-400',
      valueClass: 'text-purple-400',
      filterKey:  'hours',
      ringClass:  'ring-purple-400',
    },
    {
      label:      'Remaining Auth. Hours',
      value:      `${remaining.toFixed(1)}h`,
      icon:       TrendingUp,
      iconClass:  'bg-amber-500/15 text-amber-400',
      valueClass: remaining < 20 ? 'text-red-400' : 'text-ink-100',
      filterKey:  'remaining',
      ringClass:  'ring-amber-400',
    },
  ];

  const maxMonthHours = Math.max(...monthStats.map((m) => m.hours), 1);

  // ── Filtered project / data slices ─────────────────────────────────────────
  const activeProjects    = projects.filter((p) => p.status === 'ACTIVE');
  const completedProjects = projects.filter((p) => p.status === 'CLOSED');
  const remainingProjects = [...projects]
    .map((p) => ({ ...p, rem: Math.max(0, (p.totalAuthorizedHours || 0) - (p.hoursUsed || 0)) }))
    .sort((a, b) => a.rem - b.rem); // most urgent first

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-ink-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading your dashboard…</span>
      </div>
    );
  }

  // ── Left-panel content based on active filter ──────────────────────────────
  function PanelContent() {
    // Default view — unchanged project list
    if (!activeFilter) {
      return (
        <>
          <div className="card-header">
            <div className="flex items-center gap-2">
              <FolderKanban className="h-4 w-4 text-ink-400" />
              <h3 className="text-sm font-semibold text-ink-100">My Projects</h3>
            </div>
            <Link to="/projects" className="btn-ghost text-xs py-1 px-2">
              All projects <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <ProjectRows list={projects} />
        </>
      );
    }

    return (
      <>
        {/* Filtered header */}
        <div className="card-header">
          <div className="flex items-center gap-2">
            <FolderKanban className="h-4 w-4 text-ink-400" />
            <h3 className="text-sm font-semibold text-ink-100">{PANEL_TITLE[activeFilter]}</h3>
          </div>
          <button
            type="button"
            onClick={() => setActiveFilter(null)}
            className="btn-ghost text-xs py-1 px-2 flex items-center gap-1 text-ink-400 hover:text-ink-200"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        </div>

        {/* Per-filter body */}
        {activeFilter === 'active' && <ProjectRows list={activeProjects} emptyMsg="No active projects" />}
        {activeFilter === 'completed' && <ProjectRows list={completedProjects} emptyMsg="No completed projects" />}
        {activeFilter === 'hours' && <HoursRows />}
        {activeFilter === 'remaining' && <RemainingRows />}
      </>
    );
  }

  function ProjectRows({ list, emptyMsg = 'No projects assigned' }: { list: Project[]; emptyMsg?: string }) {
    if (list.length === 0) {
      return (
        <div className="empty-state">
          <FolderKanban className="h-10 w-10 text-ink-500 mb-3" />
          <h3 className="text-sm font-semibold text-ink-100">{emptyMsg}</h3>
        </div>
      );
    }
    return (
      <div className="divide-y divide-white/5">
        {list.map((p) => {
          const util = p.totalAuthorizedHours > 0
            ? Math.round((p.hoursUsed / p.totalAuthorizedHours) * 100)
            : 0;
          return (
            <div key={p._id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/5 transition-colors group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium text-ink-100 truncate">{p.name || 'Untitled Project'}</p>
                  {p.isNearLimit && (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className={statusBadge[p.status]}>{p.status.replace('_', ' ')}</span>
                  <span className="text-xs text-ink-400">{p.clientName || p.code}</span>
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                <div className="w-16 h-1.5 bg-white/10 rounded-full">
                  <div
                    className={clsx('h-1.5 rounded-full', util >= 90 ? 'bg-red-500' : util >= 70 ? 'bg-amber-400' : 'bg-emerald-500')}
                    style={{ width: `${Math.min(util, 100)}%` }}
                  />
                </div>
                <span className="text-xs tabular-nums text-ink-400 w-8">{util}%</span>
              </div>
              <button
                onClick={() => navigate(`/timesheet/${p._id}/${user?._id}`)}
                className="btn-ghost text-xs py-1 px-2.5 opacity-0 group-hover:opacity-100 flex-shrink-0"
              >
                Timesheet →
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  function HoursRows() {
    if (tsLoading) {
      return (
        <div className="p-5 space-y-2">
          {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-8 w-full" />)}
        </div>
      );
    }
    if (projectMonthHours.length === 0) {
      return (
        <div className="empty-state">
          <Clock className="h-10 w-10 text-ink-500 mb-3" />
          <h3 className="text-sm font-semibold text-ink-100">No hours logged this month</h3>
        </div>
      );
    }
    const maxH = Math.max(...projectMonthHours.map(r => r.hours), 1);
    return (
      <div className="divide-y divide-white/5">
        {projectMonthHours.map((row) => (
          <div key={row.projectId} className="flex items-center gap-3 px-5 py-3 hover:bg-white/5">
            <p className="text-sm font-medium text-ink-100 w-36 truncate flex-shrink-0">{row.projectName || 'Unknown'}</p>
            <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-2 bg-purple-400 rounded-full transition-all duration-500"
                style={{ width: `${(row.hours / maxH) * 100}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-ink-300 font-medium w-14 text-right flex-shrink-0">
              {row.hours}h
            </span>
          </div>
        ))}
      </div>
    );
  }

  function RemainingRows() {
    if (remainingProjects.length === 0) {
      return (
        <div className="empty-state">
          <TrendingUp className="h-10 w-10 text-ink-500 mb-3" />
          <h3 className="text-sm font-semibold text-ink-100">No projects assigned</h3>
        </div>
      );
    }
    return (
      <div className="divide-y divide-white/5">
        {remainingProjects.map((p) => {
          const rem  = p.rem;
          const auth = p.totalAuthorizedHours || 0;
          const pct  = auth > 0 ? Math.round(((auth - rem) / auth) * 100) : 0;
          const urgent = rem < 20;
          return (
            <div key={p._id} className="flex items-center gap-3 px-5 py-3 hover:bg-white/5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium text-ink-100 truncate">{p.name || 'Untitled Project'}</p>
                  {urgent && <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />}
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={clsx('h-1.5 rounded-full', pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-400' : 'bg-emerald-500')}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-ink-400">{pct}% used</span>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className={clsx('text-sm font-bold tabular-nums', urgent ? 'text-red-400' : 'text-ink-100')}>
                  {rem.toFixed(1)}h
                </p>
                <p className="text-xs text-ink-400">of {auth}h</p>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      <Header
        title={`Welcome back, ${user?.name?.split(' ')[0]} 👋`}
        subtitle="Here's a summary of your work"
        actions={
          <Link to="/timesheets" className="btn-primary text-xs py-1.5 px-3">
            <Clock className="h-3.5 w-3.5" /> Open Timesheets
          </Link>
        }
      />

      <div className="page-content">
        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(({ label, value, icon: Icon, iconClass, valueClass, filterKey, ringClass }) => {
            const isActive = activeFilter === filterKey;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setActiveFilter(prev => prev === filterKey ? null : filterKey)}
                className={clsx(
                  'stat-card text-left w-full transition-all duration-150',
                  'hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm',
                  'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                  isActive && ['ring-2', ringClass, 'shadow-md'],
                )}
              >
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide leading-snug">{label}</p>
                  <div className={clsx('h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0', iconClass)}>
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
                <p className={clsx('text-2xl font-bold tabular-nums', valueClass)}>{value}</p>
                {isActive && (
                  <p className="mt-1.5 text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                    Showing below ↓
                  </p>
                )}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Left panel — dynamically filtered */}
          <div className="card overflow-hidden lg:col-span-3">
            <PanelContent />
          </div>

          {/* Monthly hours chart — always visible, unchanged */}
          <div className="card lg:col-span-2 flex flex-col">
            <div className="card-header">
              <div className="flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-ink-400" />
                <h3 className="text-sm font-semibold text-ink-100">Monthly Hours</h3>
              </div>
              <span className="text-xs text-ink-400">{year}</span>
            </div>
            <div className="p-5">
              {tsLoading ? (
                <div className="space-y-2">
                  {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-5 w-full" />)}
                </div>
              ) : monthStats.length === 0 ? (
                <div className="empty-state py-10">
                  <BarChart2 className="h-8 w-8 text-ink-500 mb-2" />
                  <p className="text-sm text-ink-400">No hours logged yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {MONTH_NAMES.slice(0, currentMonth + 1).map((name, idx) => {
                    const h = monthStats.find((m) => m.month === idx)?.hours ?? 0;
                    const pct = (h / maxMonthHours) * 100;
                    const isCurrentMonth = idx === currentMonth;
                    return (
                      <div key={name} className="flex items-center gap-2.5 group">
                        <span className={clsx('text-xs w-7 flex-shrink-0 font-medium', isCurrentMonth ? 'text-brand-400' : 'text-ink-400')}>
                          {name}
                        </span>
                        <div className="flex-1 h-5 bg-white/10 rounded overflow-hidden">
                          <div
                            className={clsx('h-5 rounded transition-all duration-500', isCurrentMonth ? 'bg-brand-500' : 'bg-ink-500')}
                            style={{ width: h > 0 ? `${Math.max(pct, 4)}%` : '0%' }}
                          />
                        </div>
                        <span className="text-xs tabular-nums text-ink-400 w-10 text-right flex-shrink-0">
                          {h > 0 ? `${h}h` : '—'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Recent Payments ─────────────────────────────────────────────── */}
        <div className="card overflow-hidden">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-ink-400" />
              <h3 className="text-sm font-semibold text-ink-100">Recent Payments</h3>
            </div>
            <span className="text-xs text-ink-500">Last 20 payments for your projects</span>
          </div>

          {paymentsLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="skeleton h-10 w-full" />
              ))}
            </div>
          ) : payments.length === 0 ? (
            <div className="empty-state">
              <DollarSign className="h-10 w-10 text-ink-500 mb-3" />
              <h3 className="text-sm font-semibold text-ink-100">No payments yet</h3>
              <p className="text-sm text-ink-400">
                Payments recorded by the admin will appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Invoice Period</th>
                    <th>Project</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Payment Date</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => {
                    const project   = typeof p.projectId === 'object' ? (p.projectId as any) : null;
                    const symbol    = CURRENCY_SYMBOL[project?.currency ?? p.currency] ?? p.currency;
                    const badge     = PAYMENT_STATUS_STYLE[p.status] ?? { label: p.status, className: 'badge' };
                    return (
                      <tr key={p._id}>
                        <td className="font-medium text-ink-100">{p.invoiceMonth}</td>
                        <td className="text-ink-300">{project?.name ?? '—'}</td>
                        <td className="tabular-nums text-ink-100 font-medium">
                          {symbol}{p.netAmount.toLocaleString()}
                        </td>
                        <td>
                          <span className={badge.className}>{badge.label}</span>
                        </td>
                        <td className="tabular-nums text-ink-400">
                          {new Date(p.paymentDate).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric',
                          })}
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