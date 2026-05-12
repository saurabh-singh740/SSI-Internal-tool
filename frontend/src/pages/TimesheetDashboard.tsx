/**
 * TimesheetDashboard — lazy per-month loading.
 *
 * BEFORE: fetched all 12 months + 372 entries on page load (~200KB).
 * AFTER:
 *   1. Fetches metadata only (month summaries, no entries) on mount → ~2KB.
 *   2. Fetches a single month's entries on tab switch via React Query → ~15KB.
 *   3. Each month is cached independently — switching tabs is instant after first load.
 *   4. Project meta fetched in parallel with timesheet metadata.
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Clock, Loader2, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { MonthSheet as MonthSheetType } from '../types';
import MonthSheet from '../components/timesheet/Monthsheet';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface MonthSummary {
  monthIndex:                         number;
  monthName:                          string;
  monthlyTotal:                       number;
  isLocked:                           boolean;
  weeklyTotals:                       { week: number; total: number }[];
  authorizedHoursUsedUpToMonth:       number;
  authorizedHoursRemainingAfterMonth: number;
  lockedAt?:                          string;
  lockedBy?:                          string;
}

interface TimesheetMeta { _id: string; project: string; engineer: string; year: number; months: MonthSummary[]; }
interface ProjectMeta   { name: string; clientName: string; totalAuthorizedHours: number; startDate?: string; endDate?: string; }

export default function TimesheetDashboard() {
  const { projectId, engineerId } = useParams<{ projectId: string; engineerId: string }>();
  const navigate    = useNavigate();
  const location    = useLocation();
  const { user }    = useAuth();
  const queryClient = useQueryClient();

  const year              = new Date().getFullYear();
  const currentMonthIndex = new Date().getMonth();
  const [activeMonth,  setActiveMonth]  = useState<number>(currentMonthIndex);
  const [projectMeta,  setProjectMeta]  = useState<ProjectMeta>({ name: '', clientName: '', totalAuthorizedHours: 0 });
  const [engineerName, setEngineerName] = useState('');

  const effectiveEngineerId = engineerId || (user?.role === 'ENGINEER' ? user._id : '');

  const { data: timesheetMeta, isLoading: metaLoading, error: metaError } = useQuery<TimesheetMeta>({
    queryKey: ['timesheet-meta', projectId, effectiveEngineerId, year, location.key],
    queryFn:  () => api.get(`/timesheets/${projectId}/${effectiveEngineerId}/${year}`).then((r) => r.data.timesheet),
    enabled:  !!(projectId && effectiveEngineerId),
    staleTime: 0,
  });

  const { data: activeMonthData, isLoading: monthLoading, error: monthError } = useQuery<MonthSheetType>({
    queryKey: ['timesheet-month', projectId, effectiveEngineerId, year, activeMonth],
    queryFn:  () => api.get(`/timesheets/${projectId}/${effectiveEngineerId}/${year}/${activeMonth}`).then((r) => r.data.month),
    enabled:  !!(projectId && effectiveEngineerId && timesheetMeta),
    staleTime: 2 * 60 * 1000,
  });

  const prefetchMonth = useCallback(
    (monthIdx: number) => {
      if (!projectId || !effectiveEngineerId) return;
      queryClient.prefetchQuery({
        queryKey: ['timesheet-month', projectId, effectiveEngineerId, year, monthIdx],
        queryFn:  () => api.get(`/timesheets/${projectId}/${effectiveEngineerId}/${year}/${monthIdx}`).then((r) => r.data.month),
        staleTime: 2 * 60 * 1000,
      });
    },
    [projectId, effectiveEngineerId, year, queryClient]
  );

  useEffect(() => {
    if (!projectId) return;
    api.get(`/projects/${projectId}`)
      .then((r) => {
        const proj = r.data.project ?? r.data;
        setProjectMeta({
          name:                 proj.name || 'Untitled Project',
          clientName:           proj.clientName || '',
          totalAuthorizedHours: proj.totalAuthorizedHours || proj.contractedHours || 0,
          startDate:            proj.startDate,
          endDate:              proj.endDate,
        });
        if (user?.role === 'ENGINEER') {
          setEngineerName(user.name || user.email || 'Unknown');
        } else {
          const eng = proj.engineers?.find((e: any) => String(e.engineer?._id ?? e.engineer) === effectiveEngineerId);
          setEngineerName(eng?.engineer?.name || eng?.engineer?.email || 'Unknown');
        }
        if (proj.startDate) {
          const startMonth = new Date(proj.startDate).getMonth();
          if (currentMonthIndex < startMonth) setActiveMonth(startMonth);
        }
      })
      .catch(console.error);
  }, [projectId, effectiveEngineerId, user, currentMonthIndex]);

  const handleMonthUpdate = useCallback(
    (updated: MonthSheetType) => {
      queryClient.setQueryData(['timesheet-month', projectId, effectiveEngineerId, year, updated.monthIndex], updated);
      queryClient.invalidateQueries({ queryKey: ['timesheet-meta', projectId, effectiveEngineerId, year] });
    },
    [projectId, effectiveEngineerId, year, queryClient]
  );

  if (metaLoading) {
    return (
      <div className="flex flex-col min-h-screen" style={{ background: '#050816' }}>
        <div className="flex items-center justify-center h-64 gap-2 text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading timesheet…</span>
        </div>
      </div>
    );
  }

  const errorMsg = (metaError as any)?.response?.data?.message || (metaError as any)?.message;
  if (errorMsg) {
    return (
      <div className="flex flex-col min-h-screen" style={{ background: '#050816' }}>
        <div className="flex flex-col items-center justify-center h-64 gap-3 text-red-400">
          <AlertCircle className="h-7 w-7" />
          <p className="text-sm font-medium">{errorMsg}</p>
          <button onClick={() => navigate(-1)} className="text-xs text-gray-500 hover:text-gray-300 underline">
            Go back
          </button>
        </div>
      </div>
    );
  }

  if (!timesheetMeta) return null;

  const months      = timesheetMeta.months ?? [];
  const ytdHours    = months.reduce((s, m) => s + (m.monthlyTotal || 0), 0);
  const lastActiveM = [...months].filter((m) => m.monthlyTotal > 0).pop();
  const remaining   = lastActiveM ? lastActiveM.authorizedHoursRemainingAfterMonth : projectMeta.totalAuthorizedHours;
  const utilPct     = projectMeta.totalAuthorizedHours > 0
    ? Math.round((ytdHours / projectMeta.totalAuthorizedHours) * 100) : 0;

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#050816' }}>

      {/* Header card */}
      <div className="px-4 pt-4">
        <div className="rounded-xl px-4 py-3 mb-0"
             style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </button>
              <div className="w-px h-4" style={{ background: 'rgba(255,255,255,0.1)' }} />
              <div>
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-indigo-400" />
                  <span className="text-sm font-semibold text-gray-200">Timesheet — {year}</span>
                </div>
                <p className="text-[10px] text-gray-600 mt-0.5">
                  {projectMeta.name}
                  {projectMeta.clientName && ` · ${projectMeta.clientName}`}
                  {engineerName && ` · ${engineerName}`}
                </p>
              </div>
            </div>

            {/* Summary pills */}
            <div className="hidden sm:flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                   style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
                <span className="text-[10px] text-gray-500">Authorized</span>
                <span className="text-sm font-bold text-white tabular-nums">{projectMeta.totalAuthorizedHours}h</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                   style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
                <span className="text-[10px] text-gray-500">Logged (YTD)</span>
                <span className="text-sm font-bold tabular-nums" style={{ color: '#818cf8' }}>{ytdHours.toFixed(2)}h</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{
                background: remaining < 0 ? 'rgba(239,68,68,0.1)' : 'rgba(74,222,128,0.1)',
                border: `1px solid ${remaining < 0 ? 'rgba(239,68,68,0.2)' : 'rgba(74,222,128,0.2)'}`,
              }}>
                <span className="text-[10px] text-gray-500">Remaining</span>
                <span className="text-sm font-bold tabular-nums"
                      style={{ color: remaining < 0 ? '#f87171' : '#4ade80' }}>
                  {remaining.toFixed(2)}h
                </span>
              </div>
            </div>
          </div>

          {/* Utilization bar */}
          <div className="mt-3 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div className="h-1 rounded-full transition-all duration-700" style={{
              width: `${Math.min(utilPct, 100)}%`,
              background: utilPct >= 90 ? '#ef4444' : utilPct >= 70 ? '#f59e0b' : '#6366f1',
            }} />
          </div>
        </div>
      </div>

      {/* Month tabs */}
      <div className="px-4 mt-3">
        <div className="flex overflow-x-auto -mb-px" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          {MONTH_NAMES.map((name, idx) => {
            const summary  = months.find((m) => m.monthIndex === idx);
            const hasHours = (summary?.monthlyTotal || 0) > 0;
            const isLocked = summary?.isLocked;

            const projStart = projectMeta.startDate ? new Date(projectMeta.startDate) : null;
            const projEnd   = projectMeta.endDate   ? new Date(projectMeta.endDate)   : null;
            const monthEnd   = new Date(year, idx + 1, 0);
            const monthStart = new Date(year, idx, 1);

            const isBeforeProject  = projStart !== null && monthEnd < projStart;
            const effectiveCeiling = projEnd ?? new Date(year, currentMonthIndex, 31);
            const isAfterProject   = monthStart > effectiveCeiling;
            const isDisabled       = isBeforeProject || isAfterProject;
            const isActive         = activeMonth === idx;

            return (
              <button
                key={idx}
                disabled={isDisabled}
                onClick={() => !isDisabled && setActiveMonth(idx)}
                onMouseEnter={() => !isDisabled && prefetchMonth(idx)}
                title={
                  isBeforeProject ? `Project starts ${projStart!.toLocaleDateString()}`
                  : isAfterProject && projEnd ? `Project ended ${projEnd.toLocaleDateString()}`
                  : isAfterProject ? 'Future months cannot be edited'
                  : undefined
                }
                className={clsx(
                  'flex items-center gap-1 flex-shrink-0 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap',
                  isDisabled
                    ? 'border-transparent text-gray-700 cursor-not-allowed'
                    : isActive
                      ? 'border-indigo-500 text-indigo-400'
                      : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-white/20'
                )}
              >
                {name.slice(0, 3)}
                {isLocked && !isDisabled && (
                  <span className="inline-block w-1.5 h-1.5 rounded-full ml-0.5" style={{ background: '#fbbf24' }} title="Locked" />
                )}
                {!isLocked && hasHours && !isDisabled && (
                  <span className="inline-block w-1.5 h-1.5 rounded-full ml-0.5" style={{ background: '#4ade80' }} title="Has entries" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Month content */}
      <div className="px-4 pt-4">
        {monthLoading ? (
          <div className="flex items-center justify-center h-48 gap-2 text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading {MONTH_NAMES[activeMonth]}…</span>
          </div>
        ) : monthError ? (
          <div className="rounded-xl p-8 text-center"
               style={{ border: '1px solid rgba(239,68,68,0.15)', background: 'rgba(239,68,68,0.05)' }}>
            <p className="text-sm text-red-400">Failed to load {MONTH_NAMES[activeMonth]}</p>
          </div>
        ) : activeMonthData ? (
          <MonthSheet
            key={activeMonth}
            month={activeMonthData}
            projectId={projectId!}
            engineerId={effectiveEngineerId}
            year={year}
            projectName={projectMeta.name || 'Untitled Project'}
            engineerName={engineerName || 'Unknown'}
            clientName={projectMeta.clientName}
            totalAuthorizedHours={projectMeta.totalAuthorizedHours}
            projectStartDate={projectMeta.startDate}
            projectEndDate={projectMeta.endDate}
            onUpdate={handleMonthUpdate}
          />
        ) : (
          <div className="rounded-xl p-12 text-center"
               style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-sm text-gray-500">No data for {MONTH_NAMES[activeMonth]}</p>
          </div>
        )}
      </div>
    </div>
  );
}
