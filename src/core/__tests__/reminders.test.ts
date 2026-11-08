import { describe, expect, it } from 'vitest';
import type { HabitCompletion } from '../habits';
import { keysForDay, remindersDue, remindersForDay, type ReminderHabit } from '../reminders';

// Wednesday 11 March 2026, 14:00 local time.
const NOW = new Date(2026, 2, 11, 14, 0);
const base = { startDate: '2026-03-02', reminderTime: null } as const;

const gym: ReminderHabit = { ...base, id: 'gym', frequency: 'daily', reminderTime: '18:00' };
const read: ReminderHabit = { ...base, id: 'read', frequency: 'daily', reminderTime: '09:30' };
const water: ReminderHabit = { ...base, id: 'water', frequency: 'daily', reminderTime: '13:15' };

function logs(map: Record<string, string[]>) {
  return (habitId: string): HabitCompletion[] =>
    (map[habitId] ?? []).map((date) => ({ date, deletedAt: null }));
}

describe('remindersForDay', () => {
  it('gives done, due and upcoming in time order', () => {
    const result = remindersForDay([gym, read, water], logs({ read: ['2026-03-11'] }), NOW);
    expect(result).toEqual([
      { habitId: 'read', time: '09:30', status: 'done', minutesUntil: -270 },
      { habitId: 'water', time: '13:15', status: 'due', minutesUntil: -45 },
      { habitId: 'gym', time: '18:00', status: 'upcoming', minutesUntil: 240 },
    ]);
  });

  it('is due exactly at the reminder time', () => {
    const atTime = { ...gym, reminderTime: '14:00' };
    expect(remindersForDay([atTime], logs({}), NOW)[0].status).toBe('due');
  });

  it('skips habits without a reminder or not due today', () => {
    const noReminder: ReminderHabit = { ...gym, id: 'none', reminderTime: null };
    const tuesdays: ReminderHabit = { ...gym, id: 'tue', frequency: 'weekdays', weekdays: [2] };
    const archived: ReminderHabit = { ...gym, id: 'old', archivedAt: '2026-03-10T09:00:00' };
    expect(remindersForDay([noReminder, tuesdays, archived], logs({}), NOW)).toEqual([]);
  });

  it('drops a weekly habit done earlier this week, but keeps it on the day it was done', () => {
    const weekly: ReminderHabit = { ...gym, id: 'wk', frequency: 'weekly' };
    expect(remindersForDay([weekly], logs({ wk: ['2026-03-09'] }), NOW)).toEqual([]);
    expect(remindersForDay([weekly], logs({ wk: ['2026-03-11'] }), NOW)[0].status).toBe('done');
  });
});

describe('remindersDue', () => {
  const at = (h: number, m: number, day = 11) => new Date(2026, 2, day, h, m, 30);
  const noLogs = new Map<string, HabitCompletion[]>();
  const logMap = (map: Record<string, string[]>) =>
    new Map(Object.entries(map).map(([id, dates]) => [id, dates.map((date) => ({ date, deletedAt: null }))]));
  const gym6pm: ReminderHabit = { ...base, id: 'gym', frequency: 'daily', reminderTime: '18:00' };

  it('fires once at the reminder time, then not again once its key is stored', () => {
    expect(remindersDue([gym6pm], noLogs, at(17, 59), new Set())).toEqual([]);
    const first = remindersDue([gym6pm], noLogs, at(18, 0), new Set());
    expect(first).toEqual([{ key: '2026-03-11|gym|18:00', habitId: 'gym', time: '18:00' }]);
    expect(remindersDue([gym6pm], noLogs, at(18, 5), new Set([first[0].key]))).toEqual([]);
  });

  it('still fires up to 59 minutes late, but not at 60', () => {
    expect(remindersDue([gym6pm], noLogs, at(18, 59), new Set())).toHaveLength(1);
    expect(remindersDue([gym6pm], noLogs, at(19, 0), new Set())).toEqual([]);
  });

  it('does not fire when the habit is already done today', () => {
    expect(remindersDue([gym6pm], logMap({ gym: ['2026-03-11'] }), at(18, 1), new Set())).toEqual([]);
  });

  it('does not fire on a day the habit is not scheduled, or for an archived habit', () => {
    const tuesdays: ReminderHabit = { ...gym6pm, frequency: 'weekdays', weekdays: [2] };
    const archived: ReminderHabit = { ...gym6pm, archivedAt: '2026-03-10T09:00:00' };
    expect(remindersDue([tuesdays, archived], noLogs, at(18, 1), new Set())).toEqual([]);
  });

  it('does not fire for a weekly habit already done this week', () => {
    const weekly: ReminderHabit = { ...gym6pm, frequency: 'weekly' };
    expect(remindersDue([weekly], logMap({ gym: ['2026-03-09'] }), at(18, 1), new Set())).toEqual([]);
    expect(remindersDue([weekly], logMap({ gym: ['2026-03-06'] }), at(18, 1), new Set())).toHaveLength(1);
  });

  it('re-arms when the reminder time is edited', () => {
    const fired = new Set(['2026-03-11|gym|18:00']);
    const moved: ReminderHabit = { ...gym6pm, reminderTime: '18:30' };
    expect(remindersDue([moved], noLogs, at(18, 31), fired)).toEqual([
      { key: '2026-03-11|gym|18:30', habitId: 'gym', time: '18:30' },
    ]);
  });

  it('starts fresh just after midnight with a new day key', () => {
    const midnight: ReminderHabit = { ...gym6pm, reminderTime: '00:00' };
    const firedYesterday = new Set(['2026-03-11|gym|00:00']);
    expect(remindersDue([midnight], noLogs, at(0, 0, 12), firedYesterday)).toEqual([
      { key: '2026-03-12|gym|00:00', habitId: 'gym', time: '00:00' },
    ]);
  });

  it('fires a 23:59 reminder at 23:59, and it does not carry over past midnight', () => {
    const late: ReminderHabit = { ...gym6pm, reminderTime: '23:59' };
    expect(remindersDue([late], noLogs, at(23, 59), new Set())).toHaveLength(1);
    expect(remindersDue([late], noLogs, at(0, 1, 12), new Set())).toEqual([]);
  });

  it('agrees with the Today card: everything it fires shows as Due there', () => {
    const habits = [gym6pm, read, water];
    const now = at(14, 0);
    const due = remindersDue(habits, noLogs, now, new Set()).map((r) => r.habitId);
    const cardDue = remindersForDay(habits, () => [], now)
      .filter((r) => r.status === 'due')
      .map((r) => r.habitId);
    // Read (09:30) is Due on the card but more than an hour late, so it doesn't notify.
    expect(due).toEqual(['water']);
    expect(cardDue).toEqual(['read', 'water']);
  });
});

describe('keysForDay', () => {
  it('keeps only the given day’s keys', () => {
    expect(keysForDay(['2026-03-10|a|09:00', '2026-03-11|a|09:00', '2026-03-11|b|18:00'], '2026-03-11')).toEqual([
      '2026-03-11|a|09:00',
      '2026-03-11|b|18:00',
    ]);
  });
});
