import type Database from 'better-sqlite3';
import { subDays } from 'date-fns';
import { toDay } from '../core/dates';
import { groupLogsByHabit } from '../core/history';
import { keysForDay, remindersDue } from '../core/reminders';
import { formatTime } from '../shared/format';
import { getLogs } from './db/repositories/habitLogs';
import { listHabits } from './db/repositories/habits';
import { getAppSettings, getSetting, setSetting } from './db/repositories/settings';

/** Setting row holding the keys of reminders already shown today, as a JSON array. */
export const FIRED_KEYS_SETTING = 'firedReminderKeys';

export interface ReminderNotice {
  key: string;
  habitId: string;
  title: string;
  body: string;
}

/** Today's fired keys. Keys from earlier days are ignored (and dropped on the next save). */
export function loadFiredKeys(db: Database.Database, day: string): string[] {
  try {
    const stored: unknown = JSON.parse(getSetting(db, FIRED_KEYS_SETTING) ?? '[]');
    return Array.isArray(stored) ? keysForDay(stored.filter((key) => typeof key === 'string'), day) : [];
  } catch {
    return [];
  }
}

/**
 * Works out which reminders to show now and records them as fired, so each one appears once
 * even across restarts. Returns nothing when habit notifications are turned off.
 * This has no Electron in it, so it can be tested with a real database and a fixed clock.
 */
export function checkReminders(db: Database.Database, now = new Date()): ReminderNotice[] {
  const settings = getAppSettings(db);
  if (!settings.habitNotifications) return [];

  const today = toDay(now);
  const fired = loadFiredKeys(db, today);
  const habits = listHabits(db);
  // Seven days of logs cover "done today" and "weekly habit done this week".
  const logs = getLogs(db, toDay(subDays(now, 7)), today);
  const due = remindersDue(habits, groupLogsByHabit(logs), now, new Set(fired), settings.weekStartsOn);
  if (due.length === 0) return [];

  setSetting(db, FIRED_KEYS_SETTING, JSON.stringify([...fired, ...due.map((reminder) => reminder.key)]), now);

  const names = new Map(habits.map((habit) => [habit.id, habit.name]));
  return due.map((reminder) => ({
    key: reminder.key,
    habitId: reminder.habitId,
    title: names.get(reminder.habitId) ?? 'Habit reminder',
    body: `${formatTime(reminder.time)} · not done yet today`,
  }));
}
