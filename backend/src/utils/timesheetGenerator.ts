import { IMonthSheet, ITimesheetEntry } from '../models/Timesheet';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Week-of-month where weeks start on Monday.
 * Formula: the first Monday of the month begins Week 2 (unless the 1st IS a Monday).
 * getDay(): 0=Sun 1=Mon … 6=Sat  → normalise to Mon=0 … Sun=6 via (d+6)%7
 */
function weekOfMonth(year: number, month: number, day: number): number {
  const firstDay = new Date(Date.UTC(year, month, 1)).getUTCDay(); // 0=Sun … 6=Sat
  const firstDayMon = (firstDay + 6) % 7;                         // Mon=0 … Sun=6
  return Math.ceil((day + firstDayMon) / 7);
}

/** Build all daily entries for a given month */
function buildEntries(year: number, monthIndex: number): ITimesheetEntry[] {
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const entries: ITimesheetEntry[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(Date.UTC(year, monthIndex, day)); // UTC midnight — timezone-safe
    const dayOfWeek = DAY_NAMES[date.getUTCDay()];
    const week = weekOfMonth(year, monthIndex, day);

    entries.push({
      sno: day,
      week,
      dayOfWeek,
      date,
      projectWork: '',
      hours: 0,
      minutes: 0,
      totalHours: 0,
      remarks: '',
    });
  }

  return entries;
}

/** Recalculate weeklyTotals and monthlyTotal from current entries */
export function recalculateMonthTotals(month: IMonthSheet): void {
  const weekMap: Record<number, number> = {};
  let monthlyTotal = 0;

  for (const entry of month.entries) {
    entry.totalHours = Math.round((entry.hours + entry.minutes / 60) * 100) / 100;
    weekMap[entry.week] = (weekMap[entry.week] || 0) + entry.totalHours;
    monthlyTotal += entry.totalHours;
  }

  month.weeklyTotals = Object.entries(weekMap)
    .map(([week, total]) => ({ week: Number(week), total: Math.round(total * 100) / 100 }))
    .sort((a, b) => a.week - b.week);

  month.monthlyTotal = Math.round(monthlyTotal * 100) / 100;
}

/** Recalculate authorized-hours columns across all months */
export function recalculateAuthorizedHours(
  months: IMonthSheet[],
  totalAuthorizedHours: number
): void {
  let cumulativeUsed = 0;
  for (const month of months) {
    cumulativeUsed += month.monthlyTotal;
    month.authorizedHoursUsedUpToMonth = Math.round(cumulativeUsed * 100) / 100;
    month.authorizedHoursRemainingAfterMonth = Math.round(
      Math.max(0, totalAuthorizedHours - cumulativeUsed) * 100
    ) / 100;
  }
}

/** Generate 12 blank month sheets for a given year */
export function generateYearSheets(
  year: number,
  totalAuthorizedHours: number
): IMonthSheet[] {
  const months: IMonthSheet[] = MONTH_NAMES.map((monthName, monthIndex) => ({
    monthIndex,
    monthName,
    entries: buildEntries(year, monthIndex),
    weeklyTotals: [],
    monthlyTotal: 0,
    authorizedHoursUsedUpToMonth: 0,
    authorizedHoursRemainingAfterMonth: totalAuthorizedHours,
    isLocked: false,
  }));

  // initial totals (all zeros, but sets weeklyTotals structure)
  for (const month of months) recalculateMonthTotals(month);
  recalculateAuthorizedHours(months, totalAuthorizedHours);

  return months;
}
