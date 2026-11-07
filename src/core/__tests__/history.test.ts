import { describe, expect, it } from 'vitest';
import type { HabitSchedule } from '../habits';
import { dayStatus, groupLogsByHabit } from '../history';

// March 2026: the 2nd is a Monday. "Today" is Wednesday the 11th.
const TODAY = '2026-03-11';
const daily: HabitSchedule = { frequency: 'daily', startDate: '2026-03-02' };
const weekly: HabitSchedule = { frequency: 'weekly', startDate: '2026-03-02' };
const monWedFri: HabitSchedule = { frequency: 'weekdays', weekdays: [1, 3, 5], startDate: '2026-03-02' };

describe('dayStatus', () => {
  it('marks a daily habit done, missed, pending and future', () => {
    const completed = new Set(['2026-03-09']);
    expect(dayStatus(daily, '2026-03-09', completed, TODAY)).toBe('done');
    expect(dayStatus(daily, '2026-03-10', completed, TODAY)).toBe('missed');
    expect(dayStatus(daily, TODAY, completed, TODAY)).toBe('pending');
    expect(dayStatus(daily, '2026-03-12', completed, TODAY)).toBe('future');
  });

  it('treats days before the start and unchosen weekdays as unscheduled', () => {
    expect(dayStatus(daily, '2026-03-01', new Set(), TODAY)).toBe('unscheduled');
    expect(dayStatus(monWedFri, '2026-03-10', new Set(), TODAY)).toBe('unscheduled');
    expect(dayStatus(monWedFri, '2026-03-09', new Set(), TODAY)).toBe('missed');
  });

  it('shows a completion on an unscheduled day as done', () => {
    expect(dayStatus(monWedFri, '2026-03-10', new Set(['2026-03-10']), TODAY)).toBe('done');
  });

  it('judges weekly habits by the whole week', () => {
    const completed = new Set(['2026-03-04']);
    expect(dayStatus(weekly, '2026-03-04', completed, TODAY)).toBe('done');
    expect(dayStatus(weekly, '2026-03-05', completed, TODAY)).toBe('unscheduled');
    expect(dayStatus(weekly, '2026-03-09', completed, TODAY)).toBe('pending');
    expect(dayStatus(weekly, '2026-03-09', new Set(), '2026-03-16')).toBe('missed');
  });

  it('respects weeks starting on Sunday', () => {
    // Sun 8th is in the same Sunday-week as the 11th, but the Monday-week before it.
    expect(dayStatus(weekly, '2026-03-08', new Set(), TODAY, 0)).toBe('pending');
    expect(dayStatus(weekly, '2026-03-08', new Set(), TODAY, 1)).toBe('missed');
  });
});

describe('groupLogsByHabit', () => {
  it('keeps each habit’s logs together in order', () => {
    const groups = groupLogsByHabit([
      { habitId: 'a', date: '1' },
      { habitId: 'b', date: '2' },
      { habitId: 'a', date: '3' },
    ]);
    expect(groups.get('a')?.map((log) => log.date)).toEqual(['1', '3']);
    expect(groups.get('b')?.map((log) => log.date)).toEqual(['2']);
    expect(groups.get('c')).toBeUndefined();
  });
});
