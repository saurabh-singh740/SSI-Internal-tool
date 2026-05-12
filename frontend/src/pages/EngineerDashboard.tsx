import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FolderKanban, Clock, CheckCircle, TrendingUp,
  ChevronRight, AlertTriangle, BarChart2, DollarSign,
} from 'lucide-react';
import api from '../api/axios';
import { Project, Payment } from '../types';
import Header from '../components/layout/Header';
import { useAuth } from '../context/AuthContext';

const PAY_STATUS_CFG = {
  pending:  { bg: 'rgba(251,191,36,0.12)',  text: '#fbbf24', border: 'rgba(251,191,36,0.2)'  },
  received: { bg: 'rgba(74,222,128,0.12)',  text: '#4ade80', border: 'rgba(74,222,128,0.2)'  },
  overdue:  { bg: 'rgba(239,68,68,0.12)',   text: '#f87171', border: 'rgba(239,68,68,0.2)'   },
  partial:  { bg: 'rgba(99,102,241,0.12)',  text: '#818cf8', border: 'rgba(99,102,241,0.2)'  },
} as const;

const PROJ_STATUS_DOT: Record<string, string> = {
  ACTIVE: '#4ade80', CLOSED: '#9ca3af', ON_HOLD: '#fbbf24',
};

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function PayBadge({ status }: { status: string }) {
  const c = PAY_STATUS_CFG[status as keyof typeof PAY_STATUS_CFG] ?? PAY_STATUS_CFG.pending;
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
          style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
      {status}
    </span>
  );
}

type FilterKey = 'active' | 'completed' | 'hours' | 'remaining';
interface MonthStat { month: number; hours: number; }
interface ProjectMonthHours { projectId: string; projectName: string; hours: number; }

export default function EngineerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [projects,          setProjects]          = useState<Project[]>([]);
  const [monthStats,        setMonthStats]        = useState<MonthStat[]>([]);
  const [projectMonthHours, setProjectMonthHours] = useState<ProjectMonthHours[]>([]);
  const [loading,           setLoading]           = useState(true);
  const [tsLoading,         setTsLoading]         = useState(false);
  const [payments,          setPayments]          = useState<Payment[]>([]);
  const [paymentsLoading,   setPaymentsLoading]   = useState(false);
  const [activeFilter,      setActiveFilter]      = useState<FilterKey | null>(null);

  const year         = new Date().getFullYear();
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
                  return { projectId, projectName, hours: Math.round(hours * 10) / 10 };
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

  useEffect(() => {
    if (!user?._id) return;
    setPaymentsLoading(true);
    api.get('/payments/my')
      .then((r) => setPayments(r.data.payments || []))
      .catch(() => {})
      .finally(() => setPaymentsLoading(false));
  }, [user?._id]);

  const active         = projects.filter((p) => p.status === 'ACTIVE').length;
  const completed      = projects.filter((p) => p.status === 'CLOSED').length;
  const totalAuth      = projects.reduce((s, p) => s + (p.totalAuthorizedHours || 0), 0);
  const totalUsed      = projects.reduce((s, p) => s + (p.hoursUsed || 0), 0);
  const remaining      = Math.max(0, totalAuth - totalUsed);
  const thisMonthHours = monthStats.find((m) => m.month === currentMonth)?.hours ?? 0;
  const maxMonthHours  = Math.max(...monthStats.map((m) => m.hours), 1);

  const activeProjects    = projects.filter((p) => p.status === 'ACTIVE');
  const completedProjects = projects.filter((p) => p.status === 'CLOSED');
  const remainingProjects = [...projects]
    .map((p) => ({ ...p, rem: Math.max(0, (p.totalAuthorizedHours || 0) - (p.hoursUsed || 0)) }))
    .sort((a, b) => a.rem - b.rem);

  type PillDef = { label: string; value: string | number; icon: React.ElementType; color: string; key: FilterKey };
  const pills: PillDef[] = [
    { label: 'Active',    value: active,                         icon: FolderKanban, color: '#60a5fa', key: 'active'    },
    { label: 'Completed', value: completed,                      icon: CheckCircle,  color: '#4ade80', key: 'completed' },
    { label: MONTH_NAMES[currentMonth], value: `${thisMonthHours}h`, icon: Clock,   color: '#c084fc', key: 'hours'     },
    { label: 'Remaining', value: `${remaining.toFixed(1)}h`,    icon: TrendingUp,   color: '#fbbf24', key: 'remaining' },
  ];

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen" style={{ background: '#050816' }}>
        <Header title={`Welcome back, ${user?.name?.split(' ')[0] ?? ''}`} subtitle="Loading dashboard…" />
        <div className="px-4 pt-4 space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
          ))}
        </div>
      </div>
    );
  }

  function ProjectRows({ list, emptyMsg = 'No projects assigned' }: { list: Project[]; emptyMsg?: string }) {
    if (list.length === 0) return (
      <div className="py-10 text-center">
        <FolderKanban className="h-7 w-7 text-gray-700 mx-auto mb-2" />
        <p className="text-sm text-gray-500">{emptyMsg}</p>
      </div>
    );
    return (
      <div>
        {list.map((p) => {
          const util   = p.totalAuthorizedHours > 0 ? Math.round((p.hoursUsed / p.totalAuthorizedHours) * 100) : 0;
          const dotCol = PROJ_STATUS_DOT[p.status] ?? '#9ca3af';
          return (
            <div
              key={p._id}
              className="group flex items-center gap-3 px-4 py-2.5 transition-colors"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: dotCol }} />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-200 truncate block">{p.name}</span>
                <span className="text-[10px] text-gray-600">{p.clientName || p.code}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {p.isNearLimit && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                <div className="w-14 h-1 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-1 rounded-full" style={{
                    width: `${Math.min(util, 100)}%`,
                    background: util >= 90 ? '#ef4444' : util >= 70 ? '#f59e0b' : '#4ade80',
                  }} />
                </div>
                <span className="text-[10px] text-gray-600 tabular-nums w-7">{util}%</span>
              </div>
              <button
                onClick={() => navigate(`/timesheet/${p._id}/${user?._id}`)}
                className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-200 transition-all"
              >
                Timesheet <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  function HoursRows() {
    if (tsLoading) return (
      <div className="p-4 space-y-2">
        {[...Array(3)].map((_, i) => <div key={i} className="h-8 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />)}
      </div>
    );
    if (projectMonthHours.length === 0) return (
      <div className="py-10 text-center">
        <Clock className="h-7 w-7 text-gray-700 mx-auto mb-2" />
        <p className="text-sm text-gray-500">No hours logged this month</p>
      </div>
    );
    const maxH = Math.max(...projectMonthHours.map(r => r.hours), 1);
    return (
      <div>
        {projectMonthHours.map((row) => (
          <div key={row.projectId} className="flex items-center gap-3 px-4 py-2.5"
               style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <span className="text-xs text-gray-300 w-28 truncate flex-shrink-0">{row.projectName}</span>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div className="h-1.5 rounded-full" style={{ width: `${(row.hours / maxH) * 100}%`, background: '#c084fc' }} />
            </div>
            <span className="text-xs tabular-nums text-gray-400 w-10 text-right flex-shrink-0">{row.hours}h</span>
          </div>
        ))}
      </div>
    );
  }

  function RemainingRows() {
    if (remainingProjects.length === 0) return (
      <div className="py-10 text-center">
        <TrendingUp className="h-7 w-7 text-gray-700 mx-auto mb-2" />
        <p className="text-sm text-gray-500">No projects assigned</p>
      </div>
    );
    return (
      <div>
        {remainingProjects.map((p) => {
          const rem    = p.rem;
          const auth   = p.totalAuthorizedHours || 0;
          const pct    = auth > 0 ? Math.round(((auth - rem) / auth) * 100) : 0;
          const urgent = rem < 20;
          return (
            <div key={p._id} className="flex items-center gap-3 px-4 py-2.5"
                 style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-sm font-medium text-gray-200 truncate">{p.name}</span>
                  {urgent && <AlertTriangle className="h-3 w-3 text-red-500 flex-shrink-0" />}
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <div className="h-1 rounded-full" style={{
                      width: `${Math.min(pct, 100)}%`,
                      background: pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#4ade80',
                    }} />
                  </div>
                  <span className="text-[10px] text-gray-600">{pct}% used</span>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold tabular-nums" style={{ color: urgent ? '#f87171' : '#e5e7eb' }}>{rem.toFixed(1)}h</p>
                <p className="text-[10px] text-gray-600">of {auth}h</p>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const panelList = activeFilter === 'active' ? activeProjects : activeFilter === 'completed' ? completedProjects : projects;
  const panelTitle = activeFilter === 'active' ? 'Active Projects'
    : activeFilter === 'completed' ? 'Completed Projects'
    : activeFilter === 'hours'     ? `Hours — ${MONTH_NAMES[currentMonth]}`
    : activeFilter === 'remaining' ? 'Remaining Hours'
    : 'My Projects';

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#050816' }}>
      <Header
        title={`Welcome back, ${user?.name?.split(' ')[0] ?? ''}`}
        subtitle="Your project dashboard"
        actions={
          <Link
            to="/timesheets"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
            style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed)' }}
          >
            <Clock className="h-3.5 w-3.5" /> Open Timesheets
          </Link>
        }
      />

      <div className="px-4 pt-4 space-y-4">

        {/* Stat pills */}
        <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Overview</span>
            {activeFilter && (
              <button onClick={() => setActiveFilter(null)} className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors">
                Clear filter ×
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {pills.map(({ label, value, icon: Icon, color, key }) => {
              const isActive = activeFilter === key;
              return (
                <button
                  key={key}
                  onClick={() => setActiveFilter(prev => prev === key ? null : key)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all"
                  style={{
                    background: isActive ? `${color}22` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${isActive ? color + '55' : 'rgba(255,255,255,0.07)'}`,
                  }}
                >
                  <Icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color }} />
                  <span className="text-sm font-bold text-white tabular-nums">{value}</span>
                  <span className="text-[10px] text-gray-500 whitespace-nowrap">{label}</span>
                  {isActive && <span className="text-[9px]" style={{ color }}>▼</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Project panel + chart */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          <div className="lg:col-span-3 rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-2">
                <FolderKanban className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{panelTitle}</span>
              </div>
              {!activeFilter && (
                <Link to="/projects" className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-200 transition-colors">
                  All projects <ChevronRight className="h-3 w-3" />
                </Link>
              )}
            </div>
            {activeFilter === 'hours'     ? <HoursRows />     :
             activeFilter === 'remaining' ? <RemainingRows /> :
             <ProjectRows list={panelList} emptyMsg={
               activeFilter === 'active' ? 'No active projects' :
               activeFilter === 'completed' ? 'No completed projects' : 'No projects assigned'
             } />
            }
          </div>

          <div className="lg:col-span-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-2">
                <BarChart2 className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Monthly Hours</span>
              </div>
              <span className="text-[10px] text-gray-600">{year}</span>
            </div>
            <div className="p-4">
              {tsLoading ? (
                <div className="space-y-2">
                  {[...Array(6)].map((_, i) => <div key={i} className="h-5 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />)}
                </div>
              ) : monthStats.length === 0 ? (
                <div className="py-8 text-center">
                  <BarChart2 className="h-6 w-6 text-gray-700 mx-auto mb-2" />
                  <p className="text-xs text-gray-500">No hours logged yet</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {MONTH_NAMES.slice(0, currentMonth + 1).map((name, idx) => {
                    const h          = monthStats.find((m) => m.month === idx)?.hours ?? 0;
                    const pct        = (h / maxMonthHours) * 100;
                    const isCurrent  = idx === currentMonth;
                    return (
                      <div key={name} className="flex items-center gap-2">
                        <span className="text-[10px] w-6 flex-shrink-0 font-medium"
                              style={{ color: isCurrent ? '#818cf8' : '#6b7280' }}>{name}</span>
                        <div className="flex-1 h-4 rounded overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          {h > 0 && (
                            <div className="h-4 rounded flex items-center justify-end pr-1.5 transition-all duration-500"
                                 style={{ width: `${Math.max(pct, 5)}%`, background: isCurrent ? '#6366f1' : 'rgba(99,102,241,0.4)' }}>
                              <span className="text-[9px] text-white font-medium">{h}h</span>
                            </div>
                          )}
                        </div>
                        {h === 0 && <span className="text-[10px] text-gray-700">—</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Recent Payments */}
        <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center gap-2">
              <DollarSign className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Recent Payments</span>
            </div>
            <span className="text-[10px] text-gray-600">Last 20 for your projects</span>
          </div>

          {paymentsLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(3)].map((_, i) => <div key={i} className="h-10 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />)}
            </div>
          ) : payments.length === 0 ? (
            <div className="py-10 text-center">
              <DollarSign className="h-7 w-7 text-gray-700 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No payments recorded yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.015)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <th className="px-4 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest">Period</th>
                    <th className="px-3 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest">Project</th>
                    <th className="px-3 py-2 text-right text-[9px] font-semibold text-gray-700 uppercase tracking-widest">Net Paid</th>
                    <th className="px-3 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest">Status</th>
                    <th className="px-3 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest hidden md:table-cell">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => {
                    const project = typeof p.projectId === 'object' ? (p.projectId as any) : null;
                    return (
                      <tr key={p._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <td className="px-4 py-2.5">
                          <span className="text-xs font-medium text-gray-300">{p.invoiceMonth}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-xs text-gray-400">{project?.name ?? '—'}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="text-xs font-mono font-semibold text-gray-100">{p.netAmount.toLocaleString()}</span>
                        </td>
                        <td className="px-3 py-2.5"><PayBadge status={p.status} /></td>
                        <td className="px-3 py-2.5 hidden md:table-cell">
                          <span className="text-[11px] text-gray-500 tabular-nums">
                            {new Date(p.paymentDate).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
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
