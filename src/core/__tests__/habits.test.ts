import { describe, expect, it } from 'vitest';
import { parseDay, toDay } from '../dates';
import { isHabitDue, isHabitScheduled, type HabitSchedule } from '../habits';

// March 2026: the 1st is a Sunday and the 2nd a Monday.
const daily: HabitSchedule = { frequency: 'daily', startDate: '2026-03-02' };
const weekly: HabitSchedule = { frequency: 'weekly', startDate: '2026-03-02' };

function done(...dates: string[]) {
  return dates.map((date) => ({ date, deletedAt: null }));
}

describe('dates', () => {
  it('round-trips a day', () => {
    expect(toDay(parseDay('2026-03-02'))).toBe('2026-03-02');
  });

  it.each(['2026-02-30', '2026-3-2', '2026-03-02T10:00:00Z', ''])('rejects %j', (day) => {
    expect(() => parseDay(day)).toThrow(RangeError);
  });
});

describe('isHabitScheduled', () => {
  it('schedules a daily habit from its start date onward', () => {
    expect(isHabitScheduled(daily, '2026-03-01')).toBe(false);
    expect(isHabitScheduled(daily, '2026-03-02')).toBe(true);
    expect(isHabitScheduled(daily, '2026-03-07')).toBe(true);
  });

  it('schedules a weekdays habit only on the chosen days, with 0 as Sunday', () => {
    const habit: HabitSchedule = {
      frequency: 'weekdays',
      weekdays: [0, 3],
      startDate: '2026-03-01',
    };
    expect(isHabitScheduled(habit, '2026-03-01')).toBe(true);
    expect(isHabitScheduled(habit, '2026-03-02')).toBe(false);
    expect(isHabitScheduled(habit, '2026-03-04')).toBe(true);
  });

  it('never schedules a weekdays habit with no days chosen', () => {
    expect(isHabitScheduled({ ...daily, frequency: 'weekdays' }, '2026-03-02')).toBe(false);
    expect(isHabitScheduled({ ...daily, frequency: 'weekdays', weekdays: [] }, '2026-03-02')).toBe(
      false,
    );
  });

  it('stops scheduling from the local day the habit was archived', () => {
    const archivedAt = new Date(2026, 2, 5, 12).toISOString();
    const habit = { ...daily, archivedAt };
    expect(isHabitScheduled(habit, '2026-03-04')).toBe(true);
    expect(isHabitScheduled(habit, '2026-03-05')).toBe(false);
    expect(isHabitScheduled(habit, '2026-03-06')).toBe(false);
  });
});

describe('isHabitDue', () => {
  it('keeps a completed daily habit due so it can be undone', () => {
    expect(isHabitDue(daily, '2026-03-02', done('2026-03-02'))).toBe(true);
  });

  it('is not due on an unscheduled day', () => {
    expect(isHabitDue(daily, '2026-03-01', [])).toBe(false);
    expect(isHabitDue(weekly, '2026-03-01', [])).toBe(false);
  });

  it('keeps a weekly habit due every day of the week until it is done', () => {
    expect(isHabitDue(weekly, '2026-03-02', [])).toBe(true);
    expect(isHabitDue(weekly, '2026-03-08', [])).toBe(true);
  });

  it('drops a completed weekly habit for the rest of that week only', () => {
    const logs = done('2026-03-04');
    expect(isHabitDue(weekly, '2026-03-03', logs)).toBe(false);
    expect(isHabitDue(weekly, '2026-03-04', logs)).toBe(true);
    expect(isHabitDue(weekly, '2026-03-05', logs)).toBe(false);
    expect(isHabitDue(weekly, '2026-03-09', logs)).toBe(true);
  });

  it('uses the week start setting to decide which week a completion is in', () => {
    const logs = done('2026-03-08'); // Sunday
    expect(isHabitDue(weekly, '2026-03-06', logs, 1)).toBe(false);
    expect(isHabitDue(weekly, '2026-03-06', logs, 0)).toBe(true);
    expect(isHabitDue(weekly, '2026-03-09', logs, 1)).toBe(true);
    expect(isHabitDue(weekly, '2026-03-09', logs, 0)).toBe(false);
  });

  it('ignores an undone completion', () => {
    const logs = [{ date: '2026-03-04', deletedAt: '2026-03-04T10:00:00.000Z' }];
    expect(isHabitDue(weekly, '2026-03-05', logs)).toBe(true);
  });
});
