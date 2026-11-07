import { describe, expect, it } from 'vitest';
import type { HabitCompletion } from '../habits';
import { remindersForDay, type ReminderHabit } from '../reminders';

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
