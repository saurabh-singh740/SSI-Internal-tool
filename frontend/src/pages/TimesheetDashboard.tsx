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
  monthIndex:                        number;
  monthName:                         string;
  monthlyTotal:                      number;
  isLocked:                          boolean;
  weeklyTotals:                      { week: number; total: number }[];
  authorizedHoursUsedUpToMonth:      number;
  authorizedHoursRemainingAfterMonth: number;
  lockedAt?:                         string;
  lockedBy?:                         string;
}

interface TimesheetMeta {
  _id:      string;
  project:  string;
  engineer: string;
  year:     number;
  months:   MonthSummary[];
}

interface ProjectMeta {
  name:                 string;
  clientName:           string;
  totalAuthorizedHours: number;
  startDate?:           string;
  endDate?:             string;
}

export default function TimesheetDashboard() {
  const { projectId, engineerId } = useParams<{ projectId: string; engineerId: string }>();
  const navigate     = useNavigate();
  const location     = useLocation();
  const { user }     = useAuth();
  const queryClient  = useQueryClient();

  const year               = new Date().getFullYear();
  const currentMonthIndex  = new Date().getMonth();
  const [activeMonth, setActiveMonth] = useState<number>(currentMonthIndex);
  const [projectMeta, setProjectMeta] = useState<ProjectMeta>({
    name: '', clientName: '', totalAuthorizedHours: 0,
  });
  const [engineerName, setEngineerName] = useState('');

  const effectiveEngineerId = engineerId || (user?.role === 'ENGINEER' ? user._id : '');

  // ── Query 1: Timesheet metadata (month summaries, no entries) ──────────────
  const {
    data: timesheetMeta,
    isLoading: metaLoading,
    error: metaError,
  } = useQuery<TimesheetMeta>({
    queryKey: ['timesheet-meta', projectId, effectiveEngineerId, year, location.key],
    queryFn:  () =>
      api
        .get(`/timesheets/${projectId}/${effectiveEngineerId}/${year}`)
        .then((r) => r.data.timesheet),
    enabled:  !!(projectId && effectiveEngineerId),
    staleTime: 0, // always revalidate metadata (lock state can change)
  });

  // ── Query 2: Single month entries (lazy, per active tab) ──────────────────
  const {
    data:      activeMonthData,
    isLoading: monthLoading,
    error:     monthError,
  } = useQuery<MonthSheetType>({
    queryKey: ['timesheet-month', projectId, effectiveEngineerId, year, activeMonth],
    queryFn:  () =>
      api
        .get(`/timesheets/${projectId}/${effectiveEngineerId}/${year}/${activeMonth}`)
        .then((r) => r.data.month),
    enabled:  !!(projectId && effectiveEngineerId && timesheetMeta),
    staleTime: 2 * 60 * 1000, // 2 min — entries rarely change across sessions
  });

  // ── Prefetch adjacent months on hover ────────────────────────────────────
  // User hovers a month tab → we kick off the fetch before they click.
  const prefetchMonth = useCallback(
    (monthIdx: number) => {
      if (!projectId || !effectiveEngineerId) return;
      queryClient.prefetchQuery({
        queryKey: ['timesheet-month', projectId, effectiveEngineerId, year, monthIdx],
        queryFn:  () =>
          api
            .get(`/timesheets/${projectId}/${effectiveEngineerId}/${year}/${monthIdx}`)
            .then((r) => r.data.month),
        staleTime: 2 * 60 * 1000,
      });
    },
    [projectId, effectiveEngineerId, year, queryClient]
  );

  // ── Load project meta (runs once, parallel with timesheet query) ──────────
  useEffect(() => {
    if (!projectId) return;
    api
      .get(`/projects/${projectId}`)
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
          const eng = proj.engineers?.find(
            (e: any) => String(e.engineer?._id ?? e.engineer) === effectiveEngineerId
          );
          setEngineerName(eng?.engineer?.name || eng?.engineer?.email || 'Unknown');
        }

        // Snap month to project start if current month is before it
        if (proj.startDate) {
          const startMonth = new Date(proj.startDate).getMonth();
          if (currentMonthIndex < startMonth) setActiveMonth(startMonth);
        }
      })
      .catch(console.error);
  }, [projectId, effectiveEngineerId, user, currentMonthIndex]);

  // ── Update cached month data after an entry is saved ─────────────────────
  const handleMonthUpdate = useCallback(
    (updated: MonthSheetType) => {
      // Replace cached month with the freshly saved version
      queryClient.setQueryData(
        ['timesheet-month', projectId, effectiveEngineerId, year, updated.monthIndex],
        updated
      );
      // Invalidate metadata so monthly totals in the tab bar refresh
      queryClient.invalidateQueries({
        queryKey: ['timesheet-meta', projectId, effectiveEngineerId, year],
      });
    },
    [projectId, effectiveEngineerId, year, queryClient]
  );

  // ── Render states ─────────────────────────────────────────────────────────
  if (metaLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-ink-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading timesheet…</span>
      </div>
    );
  }

  const errorMsg = (metaError as any)?.response?.data?.message || (metaError as any)?.message;
  if (errorMsg) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-red-400">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm font-medium">{errorMsg}</p>
        <button onClick={() => navigate(-1)} className="mt-2 text-sm text-ink-400 hover:text-ink-200 underline">
          Go back
        </button>
      </div>
    );
  }

  if (!timesheetMeta) return null;

  const months = timesheetMeta.months ?? [];
  const ytdHours = months.reduce((s, m) => s + (m.monthlyTotal || 0), 0);
  const lastActiveMonth = [...months].filter((m) => m.monthlyTotal > 0).pop();
  const remaining = lastActiveMonth
    ? lastActiveMonth.authorizedHoursRemainingAfterMonth
    : projectMeta.totalAuthorizedHours;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-sm text-ink-400 hover:text-ink-100 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          <div>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-brand-400" />
              <h1 className="text-xl font-bold text-ink-100">Timesheet — {year}</h1>
            </div>
            <p className="text-sm text-ink-400 mt-0.5">
              {projectMeta.name}
              {projectMeta.clientName && ` · ${projectMeta.clientName}`}
              {engineerName && ` · ${engineerName}`}
            </p>
          </div>
        </div>

        {/* Year total summary */}
        <div
          className="hidden sm:flex items-center gap-4 text-sm rounded-lg px-4 py-2.5 backdrop-blur-md"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="text-center">
            <p className="text-xs text-ink-400 font-medium">Authorized</p>
            <p className="text-base font-bold text-ink-100">{projectMeta.totalAuthorizedHours}h</p>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <div className="text-center">
            <p className="text-xs text-ink-400 font-medium">Logged (YTD)</p>
            <p className="text-base font-bold text-brand-400">{ytdHours.toFixed(2)}h</p>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <div className="text-center">
            <p className="text-xs text-ink-400 font-medium">Remaining</p>
            <p className={clsx('text-base font-bold', remaining < 0 ? 'text-red-400' : 'text-emerald-400')}>
              {remaining.toFixed(2)}h
            </p>
          </div>
        </div>
      </div>

      {/* Month tabs */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex overflow-x-auto gap-0 -mb-px">
          {MONTH_NAMES.map((name, idx) => {
            const summary = months.find((m) => m.monthIndex === idx);
            const hasEntries = (summary?.monthlyTotal || 0) > 0;
            const isLocked   = summary?.isLocked;

            const projStart = projectMeta.startDate ? new Date(projectMeta.startDate) : null;
            const projEnd   = projectMeta.endDate   ? new Date(projectMeta.endDate)   : null;
            const monthEnd  = new Date(year, idx + 1, 0);
            const monthStart = new Date(year, idx, 1);

            const isBeforeProject = projStart !== null && monthEnd < projStart;
            const effectiveCeiling = projEnd ?? new Date(year, currentMonthIndex, 31);
            const isAfterProject   = monthStart > effectiveCeiling;
            const isDisabled = isBeforeProject || isAfterProject;

            return (
              <button
                key={idx}
                disabled={isDisabled}
                onClick={() => !isDisabled && setActiveMonth(idx)}
                onMouseEnter={() => !isDisabled && prefetchMonth(idx)}
                title={
                  isBeforeProject
                    ? `Project starts ${projStart!.toLocaleDateString()}`
                    : isAfterProject && projEnd
                      ? `Project ended ${projEnd.toLocaleDateString()}`
                      : isAfterProject
                        ? 'Future months cannot be edited'
                        : undefined
                }
                className={clsx(
                  'flex-shrink-0 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap',
                  isDisabled
                    ? 'border-transparent text-ink-600 cursor-not-allowed'
                    : activeMonth === idx
                      ? 'border-brand-500 text-brand-400'
                      : 'border-transparent text-ink-400 hover:text-ink-200 hover:border-white/20'
                )}
              >
                <span>{name.slice(0, 3)}</span>
                {isLocked && !isDisabled && (
                  <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-amber-400" title="Locked" />
                )}
                {!isLocked && hasEntries && !isDisabled && (
                  <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" title="Has entries" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active month */}
      {monthLoading ? (
        <div className="flex items-center justify-center h-48 gap-3 text-ink-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading {MONTH_NAMES[activeMonth]}…</span>
        </div>
      ) : monthError ? (
        <div className="rounded-xl p-8 text-center text-red-400"
          style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-sm">Failed to load {MONTH_NAMES[activeMonth]}</p>
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
        <div className="rounded-xl p-12 text-center text-ink-400"
          style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-sm">No data for {MONTH_NAMES[activeMonth]}</p>
        </div>
      )}
    </div>
  );
}
