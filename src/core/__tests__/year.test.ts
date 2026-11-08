import { describe, expect, it } from 'vitest';
import type { HabitSchedule } from '../habits';
import { overallYearHeatmap, shareToLevel, yearDays, yearHeatmap, yearLayout, type HeatmapDay } from '../year';

function done(...dates: string[]) {
  return dates.map((date) => ({ date, deletedAt: null }));
}

function cell(days: HeatmapDay[], day: string) {
  return days.find((entry) => entry.day === day);
}

// March 2026: the 2nd is a Monday. "Today" is Wednesday the 11th.
const TODAY = '2026-03-11';

describe('yearHeatmap', () => {
  const daily: HabitSchedule = { frequency: 'daily', startDate: '2026-03-02' };

  it('gives level 4 for done, 0 for missed or not done yet, and marks unscheduled and future days', () => {
    const logs = done('2025-12-31', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-10');
    const year = yearHeatmap(daily, logs, 2026, TODAY);

    expect(year.days).toHaveLength(365);
    expect(cell(year.days, '2026-01-01')).toEqual({ day: '2026-01-01', kind: 'unscheduled' });
    expect(cell(year.days, '2026-03-02')).toMatchObject({ kind: 'level', level: 4 });
    expect(cell(year.days, '2026-03-05')).toMatchObject({ kind: 'level', level: 0 });
    expect(cell(year.days, TODAY)).toMatchObject({ kind: 'level', level: 0 });
    expect(cell(year.days, '2026-03-12')).toEqual({ day: '2026-03-12', kind: 'future' });

    // 2025's log isn't this year's. Done: 2, 3, 4, 10. Missed: 5–9.
    expect(year.daysDone).toBe(4);
    expect(year.percent).toBe(44);
    expect(year.bestStreak).toBe(3);
  });

  it('rates weekly habits by weeks and ignores the current week until it is done', () => {
    const weekly: HabitSchedule = { frequency: 'weekly', startDate: '2026-03-02' };
    const year = yearHeatmap(weekly, done('2026-03-04', '2026-03-18'), 2026, '2026-03-25');
    // Weeks of 2nd and 16th done, 9th missed, 23rd still open.
    expect(year.percent).toBe(67);
    expect(year.daysDone).toBe(2);
    expect(year.bestStreak).toBe(1);
  });

  it('is empty for a year before the habit existed', () => {
    const year = yearHeatmap(daily, [], 2025, TODAY);
    expect(year.days.every((entry) => entry.kind === 'unscheduled')).toBe(true);
    expect(year).toMatchObject({ percent: null, daysDone: 0, bestStreak: 0 });
  });

  it('covers all 366 days of a leap year', () => {
    const year = yearHeatmap({ frequency: 'daily', startDate: '2028-01-01' }, done('2028-02-29'), 2028, '2028-12-31');
    expect(yearDays(2028)).toHaveLength(366);
    expect(year.days).toHaveLength(366);
    expect(cell(year.days, '2028-02-29')).toMatchObject({ kind: 'level', level: 4 });
  });
});

describe('overallYearHeatmap', () => {
  const habits = [
    { id: 'daily', frequency: 'daily', startDate: '2026-03-02' },
    { id: 'mwf', frequency: 'weekdays', weekdays: [1, 3, 5], startDate: '2026-03-02' },
    { id: 'weekly', frequency: 'weekly', startDate: '2026-03-02' },
  ] satisfies (HabitSchedule & { id: string })[];
  const logs = new Map([
    ['daily', done('2026-03-04', '2026-03-09', TODAY)],
    ['mwf', done('2026-03-09')],
    ['weekly', done('2026-03-10')],
  ]);

  it('shades each day by the share of its scheduled habits done, ignoring weekly habits', () => {
    const year = overallYearHeatmap(habits, logs, 2026, TODAY);

    expect(cell(year.days, '2026-03-01')).toEqual({ day: '2026-03-01', kind: 'unscheduled' });
    // Mon 9th: both done.
    expect(cell(year.days, '2026-03-09')).toMatchObject({ kind: 'level', level: 4, done: 2, scheduled: 2 });
    // Wed 4th: one of two.
    expect(cell(year.days, '2026-03-04')).toMatchObject({ kind: 'level', level: 2, done: 1, scheduled: 2 });
    // Tue 10th: only the daily habit is due and it wasn't done. The weekly tick doesn't count.
    expect(cell(year.days, '2026-03-10')).toMatchObject({ kind: 'level', level: 0, done: 0, scheduled: 1 });
    // Today: the daily habit is done; the Wednesday one isn't yet, so it isn't held against today.
    expect(cell(year.days, TODAY)).toMatchObject({ kind: 'level', level: 4, done: 1, scheduled: 1 });
    expect(cell(year.days, '2026-03-12')).toEqual({ day: '2026-03-12', kind: 'future' });

    // Daily: 10 scheduled days (2nd–11th), 3 done. MWF: 2, 4, 6, 9 scheduled, 1 done.
    expect(year.checkIns).toBe(4);
    expect(year.percent).toBe(29);
  });

  it('counts backfills before a habit started, like the habit’s own rate does', () => {
    const late = [{ id: 'late', frequency: 'daily', startDate: '2026-03-10' }] satisfies (HabitSchedule & { id: string })[];
    const year = overallYearHeatmap(late, new Map([['late', done('2026-03-05')]]), 2026, TODAY);
    expect(cell(year.days, '2026-03-05')).toMatchObject({ kind: 'level', level: 4, done: 1, scheduled: 1 });
    expect(cell(year.days, '2026-03-06')).toEqual({ day: '2026-03-06', kind: 'unscheduled' });
    expect(year.checkIns).toBe(1);
  });

  it('maps shares to levels 0–4', () => {
    expect(shareToLevel(0, 3)).toBe(0);
    expect(shareToLevel(1, 4)).toBe(1);
    expect(shareToLevel(1, 3)).toBe(2);
    expect(shareToLevel(1, 2)).toBe(2);
    expect(shareToLevel(3, 4)).toBe(3);
    expect(shareToLevel(5, 5)).toBe(4);
    expect(shareToLevel(0, 0)).toBe(0);
  });
});

describe('yearLayout', () => {
  it('lays a leap year out in 53 Monday-first weeks', () => {
    // 1 Jan 2028 is a Saturday.
    const { columns, monthStarts } = yearLayout(2028, 1);
    expect(columns).toHaveLength(53);
    expect(columns[0]).toEqual([null, null, null, null, null, '2028-01-01', '2028-01-02']);
    expect(columns.flat().filter(Boolean)).toHaveLength(366);
    expect(monthStarts).toHaveLength(12);
    expect(monthStarts[0]).toEqual({ month: 1, column: 0 });
  });

  it('can need 54 columns when the week starts on Sunday', () => {
    const { columns } = yearLayout(2028, 0);
    expect(columns).toHaveLength(54);
    expect(columns.every((column) => column.length === 7)).toBe(true);
  });
});
