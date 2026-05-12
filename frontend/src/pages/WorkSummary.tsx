import { useEffect, useState } from 'react';
import { BarChart2, Clock, FolderKanban, Loader2 } from 'lucide-react';
import api from '../api/axios';
import { Project } from '../types';
import Header from '../components/layout/Header';
import { useAuth } from '../context/AuthContext';

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

  const [projects,     setProjects] = useState<Project[]>([]);
  const [projectHours, setProjectH] = useState<ProjectHours[]>([]);
  const [monthHours,   setMonthH]   = useState<MonthHours[]>([]);
  const [loading,      setLoading]  = useState(true);
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

      api.get(`/timesheets/engineer/${user?._id}/${selectedYear}`)
        .then((r) => {
          const timesheets: any[] = r.data.timesheets || [];
          const monthMap: Record<number, number> = {};
          const projectMap: Record<string, number> = {};
          timesheets.forEach((ts) => {
            const proj   = ts.project;
            const projId = typeof proj === 'object' ? proj._id : proj;
            (ts.months || []).forEach((m: any) => {
              const h = m.monthlyTotal || 0;
              monthMap[m.monthIndex]  = (monthMap[m.monthIndex]  || 0) + h;
              projectMap[projId]      = (projectMap[projId]      || 0) + h;
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

  const totalLogged = projectHours.reduce((s, p) => s + p.hoursUsed, 0);
  const totalAuth   = projectHours.reduce((s, p) => s + p.totalAuth, 0);
  const utilPct     = totalAuth > 0 ? Math.round((totalLogged / totalAuth) * 100) : 0;
  const maxMonthH   = Math.max(...monthHours.map((m) => m.hours), 1);
  const maxProjectH = Math.max(...projectHours.map((p) => p.hoursUsed), 1);

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#050816' }}>
      <Header
        title="Work Summary"
        subtitle={`Hours and utilization for ${selectedYear}`}
        actions={
          <select
            value={selectedYear}
            onChange={(e) => setYear(Number(e.target.value))}
            className="text-xs text-gray-300 rounded-lg px-2 py-1.5 outline-none"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        }
      />

      <div className="px-4 pt-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-64 gap-2 text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading summary…</span>
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-xl py-20 text-center"
               style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <FolderKanban className="h-8 w-8 text-gray-700 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-400">No projects assigned</p>
            <p className="text-xs text-gray-600 mt-1">You'll see your work summary once you're assigned to a project.</p>
          </div>
        ) : (
          <>
            {/* Summary pills */}
            <div className="rounded-xl px-4 py-3"
                 style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest block mb-3">Summary</span>
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                     style={{ background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)' }}>
                  <Clock className="h-3.5 w-3.5 flex-shrink-0" style={{ color: '#60a5fa' }} />
                  <span className="text-sm font-bold text-white tabular-nums">{totalLogged.toFixed(1)}h</span>
                  <span className="text-[10px] text-gray-500">Total Logged</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                     style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)' }}>
                  <BarChart2 className="h-3.5 w-3.5 flex-shrink-0" style={{ color: '#4ade80' }} />
                  <span className="text-sm font-bold text-white tabular-nums">{totalAuth}h</span>
                  <span className="text-[10px] text-gray-500">Authorized</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{
                  background: utilPct >= 90 ? 'rgba(239,68,68,0.1)' : utilPct >= 70 ? 'rgba(251,191,36,0.1)' : 'rgba(192,132,252,0.1)',
                  border: `1px solid ${utilPct >= 90 ? 'rgba(239,68,68,0.2)' : utilPct >= 70 ? 'rgba(251,191,36,0.2)' : 'rgba(192,132,252,0.2)'}`,
                }}>
                  <BarChart2 className="h-3.5 w-3.5 flex-shrink-0"
                             style={{ color: utilPct >= 90 ? '#f87171' : utilPct >= 70 ? '#fbbf24' : '#c084fc' }} />
                  <span className="text-sm font-bold text-white tabular-nums">{utilPct}%</span>
                  <span className="text-[10px] text-gray-500">Utilization</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                     style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
                  <Clock className="h-3.5 w-3.5 flex-shrink-0" style={{ color: '#818cf8' }} />
                  <span className="text-sm font-bold text-white tabular-nums">{Math.max(0, totalAuth - totalLogged).toFixed(1)}h</span>
                  <span className="text-[10px] text-gray-500">Remaining</span>
                </div>
              </div>
              <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div className="h-1.5 rounded-full transition-all duration-700" style={{
                  width: `${Math.min(utilPct, 100)}%`,
                  background: utilPct >= 90 ? '#ef4444' : utilPct >= 70 ? '#f59e0b' : '#4ade80',
                }} />
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* Monthly hours */}
              <div className="rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex items-center justify-between px-4 py-2.5"
                     style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center gap-2">
                    <BarChart2 className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Hours by Month</span>
                  </div>
                  <span className="text-[10px] text-gray-600">{selectedYear}</span>
                </div>
                <div className="p-4 space-y-1.5">
                  {MONTH_NAMES.map((name, idx) => {
                    if (selectedYear === year && idx > currentMonth) return null;
                    const h          = monthHours.find((m) => m.month === idx)?.hours ?? 0;
                    const pct        = (h / maxMonthH) * 100;
                    const isCurrent  = idx === currentMonth && selectedYear === year;
                    return (
                      <div key={name} className="flex items-center gap-2">
                        <span className="text-[10px] w-7 flex-shrink-0 font-medium"
                              style={{ color: isCurrent ? '#818cf8' : '#6b7280' }}>
                          {name.slice(0, 3)}
                        </span>
                        <div className="flex-1 h-5 rounded overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          {h > 0 && (
                            <div className="h-5 rounded flex items-center justify-end pr-2 transition-all duration-500"
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
              </div>

              {/* Hours by project */}
              <div className="rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex items-center justify-between px-4 py-2.5"
                     style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center gap-2">
                    <FolderKanban className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Hours by Project</span>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  {projectHours.map((p) => {
                    const pct  = (p.hoursUsed / maxProjectH) * 100;
                    const util = p.totalAuth > 0 ? Math.round((p.hoursUsed / p.totalAuth) * 100) : 0;
                    return (
                      <div key={p.projectId}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-medium text-gray-200 truncate">{p.projectName}</span>
                            <code className="text-[9px] font-mono text-gray-600 flex-shrink-0">{p.code}</code>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                            <span className="text-xs font-semibold text-gray-100 tabular-nums">{p.hoursUsed}h</span>
                            <span className="text-[10px] text-gray-600">/ {p.totalAuth}h</span>
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          <div className="h-1.5 rounded-full transition-all duration-500" style={{
                            width: p.hoursUsed > 0 ? `${Math.max(pct, 2)}%` : '0%',
                            background: util >= 90 ? '#ef4444' : util >= 70 ? '#f59e0b' : '#6366f1',
                          }} />
                        </div>
                        <span className="text-[9px] text-gray-600">{util}% utilized</span>
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
