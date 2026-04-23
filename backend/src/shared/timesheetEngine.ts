/**
 * TimesheetEngine — single source of truth for timesheet calculation.
 *
 * Two modes, identical arithmetic:
 *   previewTimesheets()  → pure calculation, NO DB writes (Pre-Sales simulation)
 *   persistTimesheets()  → writes Timesheet documents (called by ConversionService)
 *
 * Both use the SAME getWorkingDaysInMonth() and monthRange() internals so
 * the projected hours shown during planning exactly match what gets generated
 * when the deal converts to a project.
 */

import Timesheet from '../models/Timesheet';
import { generateYearSheets } from '../utils/timesheetGenerator';
import { ClientSession } from 'mongoose';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ResourceAssignment {
  engineerId:           string;
  role:                 string;
  allocationPercentage: number;
  startDate:            Date;
  endDate:              Date;
  totalAuthorizedHours?: number;
}

export interface MonthlyProjection {
  year:          number;
  month:         number;   // 1–12
  monthName:     string;
  workingDays:   number;
  expectedHours: number;
}

export interface EngineerProjection {
  engineerId:         string;
  months:             MonthlyProjection[];
  totalExpectedHours: number;
}

// ── Internals ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

/** Count Mon–Fri days in a calendar month (UTC-safe, no external deps). */
export function getWorkingDaysInMonth(year: number, monthIndex: number): number {
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(Date.UTC(year, monthIndex, d)).getUTCDay();
    if (dow !== 0 && dow !== 6) count++; // 0 = Sun, 6 = Sat
  }
  return count;
}

/** Year+month pairs between two dates, inclusive on both ends. */
function monthRange(
  start: Date,
  end:   Date
): Array<{ year: number; monthIndex: number }> {
  const result: Array<{ year: number; monthIndex: number }> = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const bound  = new Date(Date.UTC(end.getUTCFullYear(),   end.getUTCMonth(),   1));
  while (cursor <= bound) {
    result.push({ year: cursor.getUTCFullYear(), monthIndex: cursor.getUTCMonth() });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return result;
}

/** Core projection — shared by both modes. */
function buildProjection(assignments: ResourceAssignment[]): EngineerProjection[] {
  return assignments
    .filter(a => a.startDate && a.endDate && new Date(a.startDate) <= new Date(a.endDate))
    .map(a => {
      const start = new Date(a.startDate);
      const end   = new Date(a.endDate);

      const months = monthRange(start, end).map(({ year, monthIndex }) => {
        const workingDays   = getWorkingDaysInMonth(year, monthIndex);
        const expectedHours = Math.round(workingDays * 8 * (a.allocationPercentage / 100) * 10) / 10;
        return {
          year,
          month:     monthIndex + 1,
          monthName: MONTH_NAMES[monthIndex],
          workingDays,
          expectedHours,
        };
      });

      return {
        engineerId: a.engineerId,
        months,
        totalExpectedHours: Math.round(
          months.reduce((s, m) => s + m.expectedHours, 0) * 10
        ) / 10,
      };
    });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Preview mode — returns projected hours per engineer per month.
 * Zero DB writes. Safe to call from any GET endpoint.
 */
export function previewTimesheets(assignments: ResourceAssignment[]): EngineerProjection[] {
  return buildProjection(assignments);
}

/**
 * Persist mode — creates Timesheet documents using the existing
 * generateYearSheets() engine so both code paths produce identical structures.
 *
 * Idempotent: skips if a timesheet for (project, engineer, year) already exists.
 * Accepts an optional Mongoose session for transactional usage.
 */
export async function persistTimesheets(
  assignments: ResourceAssignment[],
  projectId:   string,
  session?:    ClientSession
): Promise<void> {
  const projections = buildProjection(assignments);

  for (const proj of projections) {
    // Group months by year so we create one Timesheet document per engineer per year
    const yearMap = new Map<number, MonthlyProjection[]>();
    for (const m of proj.months) {
      if (!yearMap.has(m.year)) yearMap.set(m.year, []);
      yearMap.get(m.year)!.push(m);
    }

    for (const [year, _months] of yearMap) {
      const exists = await Timesheet.exists({
        project:  projectId,
        engineer: proj.engineerId,
        year,
      });
      if (exists) continue;

      // Reuse the SAME generator used by projectHandler — identical output
      const assignment = assignments.find(a => a.engineerId === proj.engineerId)!;
      const authorizedHours = assignment.totalAuthorizedHours
        ?? Math.round(proj.totalExpectedHours);

      const months = generateYearSheets(year, authorizedHours);

      const opts = session ? { session } : {};
      await Timesheet.create([{
        project:  projectId,
        engineer: proj.engineerId,
        year,
        months,
      }], opts);
    }
  }
}
