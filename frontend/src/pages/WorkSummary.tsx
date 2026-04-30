import { useEffect, useState } from 'react';
import { BarChart2, Clock, FolderKanban, Loader2 } from 'lucide-react';
import api from '../api/axios';
import { Project } from '../types';
import Header from '../components/layout/Header';
import { useAuth } from '../context/AuthContext';
import { clsx } from 'clsx';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

interface ProjectHours { projectId: string; projectName: string; code: string; hoursUsed: number; totalAuth: number; }
interface MonthHours   { month: number; monthName: string; hours: number; }

export default function WorkSummary() {
  const { user } = useAuth();
  const year = new Date().getFullYear();
  const currentMonth = new Date().getMonth();

  const [projects, setProjects]     = useState<Project[]>([]);
  const [projectHours, setProjectH] = useState<ProjectHours[]>([]);
  const [monthHours, setMonthH]     = useState<MonthHours[]>([]);
  const [loading, setLoading]       = useState(true);
  const [selectedYear, setYear]     = useState(year);

  useEffect(() => {
    setLoading(true);
    api.get('/projects').then((r) => {
      const all: Project[] = r.data.projects || r.data || [];
      const mine = all.filter((p) =>
        p.engineers?.some((e: any) => String(e.engineer?._id || e.engineer) === user?._id)
      );
      setProjects(mine);

      if (mine.length === 0) { setLoading(false); return; }

      // Single batch request — replaces N+1 pattern
      api.get(`/timesheets/engineer/${user?._id}/${selectedYear}`)
        .then((r) => {
          const timesheets: any[] = r.data.timesheets || [];
          const monthMap: Record<number, number> = {};
          const projectMap: Record<string, number> = {};

          timesheets.forEach((ts) => {
            const proj = ts.project;
            const projId = typeof proj === 'object' ? proj._id : proj;
            (ts.months || []).forEach((m: any) => {
              const h = m.monthlyTotal || 0;
              monthMap[m.monthIndex] = (monthMap[m.monthIndex] || 0) + h;
              projectMap[projId] = (projectMap[projId] || 0) + h;
            });
          });

          const perProject: ProjectHours[] = mine.map((p) => ({
            projectId:   p._id,
            projectName: p.name,
            code:        p.code,
            hoursUsed:   Math.round((projectMap[p._id] || 0) * 10) / 10,
            totalAuth:   p.totalAuthorizedHours || 0,
          }));

          setProjectH(perProject.sort((a, b) => b.hoursUsed - a.hoursUsed));
          setMonthH(
            Object.entries(monthMap)
              .map(([m, h]) => ({ month: Number(m), monthName: MONTH_NAMES[Number(m)], hours: Math.round(h * 10) / 10 }))
              .sort((a, b) => a.month - b.month),
          );
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }).catch(() => setLoading(false));
  }, [user?._id, selectedYear]);

  const totalLogged  = projectHours.reduce((s, p) => s + p.hoursUsed, 0);
  const totalAuth    = projectHours.reduce((s, p) => s + p.totalAuth, 0);
  const utilPct      = totalAuth > 0 ? Math.round((totalLogged / totalAuth) * 100) : 0;
  const maxMonthH    = Math.max(...monthHours.map((m) => m.hours), 1);
  const maxProjectH  = Math.max(...projectHours.map((p) => p.hoursUsed), 1);

  return (
    <div>
      <Header
        title="Work Summary"
        subtitle={`Your hours and utilization for ${selectedYear}`}
        actions={
          <select
            id="work-summary-year"
            name="year"
            value={selectedYear}
            onChange={(e) => setYear(Number(e.target.value))}
            className="form-select w-auto text-xs py-1.5"
          >
            {[year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        }
      />

      <div className="page-content">
        {loading ? (
          <div className="flex items-center justify-center h-64 gap-3 text-ink-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading summary…</span>
          </div>
        ) : projects.length === 0 ? (
          <div className="card empty-state py-20">
            <FolderKanban className="h-10 w-10 text-ink-500 mb-3" />
            <h3 className="text-sm font-semibold text-ink-100">No projects assigned</h3>
            <p className="text-sm text-ink-400">You'll see your work summary once you're assigned to a project.</p>
          </div>
        ) : (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="stat-card">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide">Total Hours Logged</p>
                  <div className="h-8 w-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
                    <Clock className="h-4 w-4 text-blue-400" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-ink-100 tabular-nums">{totalLogged.toFixed(1)}h</p>
                <p className="text-xs text-ink-400 mt-1">across {projects.length} project{projects.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="stat-card">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide">Authorized Hours</p>
                  <div className="h-8 w-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                    <BarChart2 className="h-4 w-4 text-emerald-400" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-ink-100 tabular-nums">{totalAuth}h</p>
                <p className="text-xs text-ink-400 mt-1">{Math.max(0, totalAuth - totalLogged).toFixed(1)}h remaining</p>
              </div>
              <div className="stat-card">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold text-ink-400 uppercase tracking-wide">Overall Utilization</p>
                  <div className="h-8 w-8 rounded-lg bg-purple-500/15 flex items-center justify-center">
                    <BarChart2 className="h-4 w-4 text-purple-400" />
                  </div>
                </div>
                <p className={clsx('text-3xl font-bold tabular-nums', utilPct >= 90 ? 'text-red-400' : utilPct >= 70 ? 'text-amber-400' : 'text-ink-100')}>
                  {utilPct}%
                </p>
                <div className="mt-2 h-1.5 bg-white/10 rounded-full">
                  <div
                    className={clsx('h-1.5 rounded-full transition-all duration-700', utilPct >= 90 ? 'bg-red-500' : utilPct >= 70 ? 'bg-amber-500' : 'bg-emerald-500')}
                    style={{ width: `${Math.min(utilPct, 100)}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Monthly hours bar chart */}
              <div className="card">
                <div className="card-header">
                  <div className="flex items-center gap-2">
                    <BarChart2 className="h-4 w-4 text-ink-400" />
                    <h3 className="text-sm font-semibold text-ink-100">Hours by Month</h3>
                  </div>
                  <span className="text-xs text-ink-400">{selectedYear}</span>
                </div>
                <div className="p-5 space-y-2">
                  {MONTH_NAMES.map((name, idx) => {
                    if (selectedYear === year && idx > currentMonth) return null;
                    const h = monthHours.find((m) => m.month === idx)?.hours ?? 0;
                    const pct = (h / maxMonthH) * 100;
                    const isCurrent = idx === currentMonth && selectedYear === year;
                    return (
                      <div key={name} className="flex items-center gap-2.5">
                        <span className={clsx('text-xs w-8 flex-shrink-0 font-medium', isCurrent ? 'text-brand-400' : 'text-ink-400')}>
                          {name.slice(0, 3)}
                        </span>
                        <div className="flex-1 h-6 bg-white/10 rounded overflow-hidden">
                          {h > 0 && (
                            <div
                              className={clsx('h-6 rounded flex items-center justify-end pr-2 transition-all duration-500', isCurrent ? 'bg-brand-500' : 'bg-ink-500')}
                              style={{ width: `${Math.max(pct, 6)}%` }}
                            >
                              <span className="text-white text-xs font-medium">{h}h</span>
                            </div>
                          )}
                        </div>
                        {h === 0 && <span className="text-xs text-ink-500 tabular-nums">—</span>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Hours by project */}
              <div className="card">
                <div className="card-header">
                  <div className="flex items-center gap-2">
                    <FolderKanban className="h-4 w-4 text-ink-400" />
                    <h3 className="text-sm font-semibold text-ink-100">Hours by Project</h3>
                  </div>
                </div>
                <div className="p-5 space-y-4">
                  {projectHours.map((p) => {
                    const pct = (p.hoursUsed / maxProjectH) * 100;
                    const util = p.totalAuth > 0 ? Math.round((p.hoursUsed / p.totalAuth) * 100) : 0;
                    return (
                      <div key={p.projectId}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <p className="text-sm font-medium text-ink-100 truncate">{p.projectName || 'Unknown'}</p>
                            <span className="text-xs text-ink-400 font-mono flex-shrink-0">{p.code}</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                            <span className="text-xs font-semibold text-ink-100 tabular-nums">{p.hoursUsed}h</span>
                            <span className="text-xs text-ink-400">/ {p.totalAuth}h</span>
                          </div>
                        </div>
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className={clsx('h-2 rounded-full transition-all duration-500', util >= 90 ? 'bg-red-500' : util >= 70 ? 'bg-amber-500' : 'bg-blue-500')}
                            style={{ width: p.hoursUsed > 0 ? `${Math.max(pct, 2)}%` : '0%' }}
                          />
                        </div>
                        <p className="text-xs text-ink-400 mt-0.5">{util}% utilized</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}