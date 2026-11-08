import { describe, expect, it } from 'vitest';
import type { HabitSchedule } from '../habits';
import { monthDays, monthGrid } from '../month';

// March 2026: the 1st is a Sunday, the 2nd a Monday.
function done(...dates: string[]) {
  return dates.map((date) => ({ date, deletedAt: null }));
}

function statusOf(grid: ReturnType<typeof monthGrid>, day: string) {
  return grid.days.find((entry) => entry.day === day)?.status;
}

describe('monthDays', () => {
  it('lists every day of the month, including 29 February in a leap year', () => {
    expect(monthDays(2026, 3)).toHaveLength(31);
    expect(monthDays(2026, 2)).toHaveLength(28);
    expect(monthDays(2028, 2).at(-1)).toBe('2028-02-29');
  });
});

describe('monthGrid', () => {
  const monWedFri: HabitSchedule = { frequency: 'weekdays', weekdays: [1, 3, 5], startDate: '2026-03-02' };

  it('marks a chosen-days habit day by day and rates only the chosen days', () => {
    // Fri 6th missed; Tue 3rd is an off day that was ticked anyway.
    const grid = monthGrid(monWedFri, done('2026-03-02', '2026-03-03', '2026-03-04', '2026-03-09'), 2026, 3, '2026-03-11');

    expect(grid.days).toHaveLength(31);
    expect(statusOf(grid, '2026-03-01')).toBe('unscheduled'); // before the start
    expect(statusOf(grid, '2026-03-02')).toBe('done');
    expect(statusOf(grid, '2026-03-03')).toBe('done'); // shown, but doesn't count towards the rate
    expect(statusOf(grid, '2026-03-05')).toBe('unscheduled');
    expect(statusOf(grid, '2026-03-06')).toBe('missed');
    expect(statusOf(grid, '2026-03-11')).toBe('pending');
    expect(statusOf(grid, '2026-03-13')).toBe('future');
    // Done: 2, 4, 9. Missed: 6. Today is pending and left out.
    expect(grid.rate).toEqual({ kind: 'percent', percent: 75, done: 3, scheduled: 4 });
  });

  it('counts weeks with a completion for weekly habits', () => {
    const weekly: HabitSchedule = { frequency: 'weekly', startDate: '2026-02-02' };
    // Two logs in the week of the 2nd count once; 28 Feb is outside the month.
    const logs = done('2026-02-28', '2026-03-04', '2026-03-05', '2026-03-17');
    const grid = monthGrid(weekly, logs, 2026, 3, '2026-03-31');

    expect(grid.rate).toEqual({ kind: 'weeks', weeks: 2 });
    expect(statusOf(grid, '2026-03-03')).toBe('unscheduled'); // week already done
    expect(statusOf(grid, '2026-03-10')).toBe('missed'); // a week with no completion
  });

  it('handles a habit started mid-month, counting backfills before the start', () => {
    const daily: HabitSchedule = { frequency: 'daily', startDate: '2026-03-15' };
    const logs = done('2026-03-10', '2026-03-15', '2026-03-16', '2026-03-18');
    const grid = monthGrid(daily, logs, 2026, 3, '2026-03-20');

    expect(statusOf(grid, '2026-03-09')).toBe('unscheduled');
    expect(statusOf(grid, '2026-03-10')).toBe('done');
    expect(statusOf(grid, '2026-03-14')).toBe('unscheduled');
    expect(statusOf(grid, '2026-03-17')).toBe('missed');
    expect(statusOf(grid, '2026-03-20')).toBe('pending');
    // Done: 10, 15, 16, 18. Missed: 17, 19.
    expect(grid.rate).toEqual({ kind: 'percent', percent: 67, done: 4, scheduled: 6 });
  });

  it('shows future days as future and has no rate for a month that has not started', () => {
    const daily: HabitSchedule = { frequency: 'daily', startDate: '2026-03-02' };
    const grid = monthGrid(daily, [], 2026, 4, '2026-03-11');

    expect(grid.days.every((entry) => entry.status === 'future')).toBe(true);
    expect(grid.rate).toEqual({ kind: 'percent', percent: null, done: 0, scheduled: 0 });
  });

  it('ignores undone (soft-deleted) logs', () => {
    const daily: HabitSchedule = { frequency: 'daily', startDate: '2026-03-02' };
    const grid = monthGrid(daily, [{ date: '2026-03-02', deletedAt: '2026-03-02T10:00:00Z' }], 2026, 3, '2026-03-03');
    expect(statusOf(grid, '2026-03-02')).toBe('missed');
  });
});
