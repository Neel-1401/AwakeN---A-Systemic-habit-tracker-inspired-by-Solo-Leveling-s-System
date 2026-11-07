import { describe, expect, it } from 'vitest';
import type { HabitSchedule } from '../habits';
import { calculateStreaks } from '../streaks';

// March 2026: the 2nd is a Monday.
const daily: HabitSchedule = { frequency: 'daily', startDate: '2026-03-02' };
const weekly: HabitSchedule = { frequency: 'weekly', startDate: '2026-03-02' };
const monWedFri: HabitSchedule = {
  frequency: 'weekdays',
  weekdays: [1, 3, 5],
  startDate: '2026-03-02',
};

function done(...dates: string[]) {
  return dates.map((date) => ({ date, deletedAt: null }));
}

describe('calculateStreaks: daily', () => {
  it('is zero with no completions', () => {
    expect(calculateStreaks(daily, [], '2026-03-05')).toEqual({ current: 0, best: 0 });
  });

  it('counts consecutive days including today', () => {
    const logs = done('2026-03-02', '2026-03-03', '2026-03-04');
    expect(calculateStreaks(daily, logs, '2026-03-04')).toEqual({ current: 3, best: 3 });
  });

  it('does not break the streak while today is still incomplete', () => {
    const logs = done('2026-03-02', '2026-03-03');
    expect(calculateStreaks(daily, logs, '2026-03-04')).toEqual({ current: 2, best: 2 });
  });

  it('resets current but keeps best after a missed day', () => {
    const logs = done('2026-03-02', '2026-03-03', '2026-03-04', '2026-03-06');
    expect(calculateStreaks(daily, logs, '2026-03-06')).toEqual({ current: 1, best: 3 });
  });

  it('reaches zero once yesterday was missed', () => {
    const logs = done('2026-03-02', '2026-03-03');
    expect(calculateStreaks(daily, logs, '2026-03-05')).toEqual({ current: 0, best: 2 });
  });

  it('joins two runs when the gap is backfilled', () => {
    const logs = done('2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06');
    expect(calculateStreaks(daily, logs, '2026-03-06')).toEqual({ current: 5, best: 5 });
  });

  it('counts backfilled days before the start date', () => {
    const habit = { ...daily, startDate: '2026-03-04' };
    const logs = done('2026-03-03', '2026-03-04');
    expect(calculateStreaks(habit, logs, '2026-03-04')).toEqual({ current: 2, best: 2 });
  });

  it('ignores undone, duplicate and future completions', () => {
    const logs = [
      ...done('2026-03-02', '2026-03-02', '2026-03-09'),
      { date: '2026-03-03', deletedAt: '2026-03-03T10:00:00.000Z' },
    ];
    expect(calculateStreaks(daily, logs, '2026-03-04')).toEqual({ current: 0, best: 1 });
  });

  it('is zero before the habit starts', () => {
    expect(calculateStreaks(daily, [], '2026-03-01')).toEqual({ current: 0, best: 0 });
  });

  it('keeps the streak an archived habit ended on', () => {
    const habit = { ...daily, archivedAt: new Date(2026, 2, 5, 12).toISOString() };
    const logs = done('2026-03-02', '2026-03-03', '2026-03-04');
    expect(calculateStreaks(habit, logs, '2026-03-20')).toEqual({ current: 3, best: 3 });
  });

  it('handles a daylight saving change without skipping or repeating a day', () => {
    const habit = { ...daily, startDate: '2026-03-06' };
    const logs = done('2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10');
    expect(calculateStreaks(habit, logs, '2026-03-10')).toEqual({ current: 5, best: 5 });
  });
});

describe('calculateStreaks: chosen weekdays', () => {
  it('skips unscheduled days', () => {
    const logs = done('2026-03-02', '2026-03-04', '2026-03-06', '2026-03-09');
    expect(calculateStreaks(monWedFri, logs, '2026-03-10')).toEqual({ current: 4, best: 4 });
  });

  it('breaks on a missed scheduled day', () => {
    const logs = done('2026-03-02', '2026-03-06');
    expect(calculateStreaks(monWedFri, logs, '2026-03-06')).toEqual({ current: 1, best: 1 });
  });

  it('gives no credit for a completion on an unscheduled day', () => {
    const logs = done('2026-03-02', '2026-03-03');
    expect(calculateStreaks(monWedFri, logs, '2026-03-03')).toEqual({ current: 1, best: 1 });
  });

  it('is zero when no days are chosen', () => {
    const habit: HabitSchedule = { frequency: 'weekdays', startDate: '2026-03-02' };
    expect(calculateStreaks(habit, done('2026-03-02'), '2026-03-03')).toEqual({
      current: 0,
      best: 0,
    });
  });
});

describe('calculateStreaks: weekly', () => {
  it('counts weeks, whichever day each was done', () => {
    const logs = done('2026-03-02', '2026-03-15', '2026-03-18');
    expect(calculateStreaks(weekly, logs, '2026-03-18')).toEqual({ current: 3, best: 3 });
  });

  it('counts a week once however many times it was done', () => {
    const logs = done('2026-03-02', '2026-03-03', '2026-03-04');
    expect(calculateStreaks(weekly, logs, '2026-03-04')).toEqual({ current: 1, best: 1 });
  });

  it('does not break the streak during an incomplete current week', () => {
    const logs = done('2026-03-02', '2026-03-09');
    expect(calculateStreaks(weekly, logs, '2026-03-15')).toEqual({ current: 2, best: 2 });
    expect(calculateStreaks(weekly, logs, '2026-03-16')).toEqual({ current: 2, best: 2 });
    expect(calculateStreaks(weekly, logs, '2026-03-23')).toEqual({ current: 0, best: 2 });
  });

  it('resets after a fully missed week', () => {
    const logs = done('2026-03-02', '2026-03-09', '2026-03-23');
    expect(calculateStreaks(weekly, logs, '2026-03-23')).toEqual({ current: 1, best: 2 });
  });

  it('uses the week start setting', () => {
    // Sat 7th and Sun 8th share a Monday-start week but not a Sunday-start one.
    const logs = done('2026-03-07', '2026-03-08');
    const habit = { ...weekly, startDate: '2026-03-07' };
    expect(calculateStreaks(habit, logs, '2026-03-08', 1)).toEqual({ current: 1, best: 1 });
    expect(calculateStreaks(habit, logs, '2026-03-08', 0)).toEqual({ current: 2, best: 2 });
  });
});
