import { toDay, type WeekStartsOn } from './dates';
import { completedDays, isHabitDue, type HabitCompletion, type HabitSchedule } from './habits';
import type { Habit } from './types';

export type ReminderHabit = HabitSchedule & Pick<Habit, 'id' | 'reminderTime'>;

/** done: completed today. due: the time has passed and it isn't done. upcoming: later today. */
export type ReminderStatus = 'done' | 'due' | 'upcoming';

export interface TodayReminder {
  habitId: string;
  /** HH:mm */
  time: string;
  status: ReminderStatus;
  /** Minutes from now until the reminder time. Zero or negative once it has passed. */
  minutesUntil: number;
}

/** A reminder fires only within this many minutes after its time, so a late launch doesn't flood. */
export const REMINDER_WINDOW_MINUTES = 60;

export interface DueReminder {
  /** Identifies one firing. Including the time means editing the time re-arms the reminder. */
  key: string;
  habitId: string;
  /** HH:mm */
  time: string;
}

export function reminderKey(day: string, habitId: string, time: string): string {
  return `${day}|${habitId}|${time}`;
}

/** The keys that belong to `day`. Older ones can be thrown away. */
export function keysForDay(keys: readonly string[], day: string): string[] {
  return keys.filter((key) => key.startsWith(`${day}|`));
}

function minutesOfDay(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Today's reminders, in time order, for habits that have a reminder time and are due today.
 * A weekly habit already done earlier this week isn't due, so it has no reminder.
 * `logsFor` returns one habit's logs.
 */
export function remindersForDay(
  habits: readonly ReminderHabit[],
  logsFor: (habitId: string) => readonly HabitCompletion[],
  now: Date,
  weekStartsOn: WeekStartsOn = 1,
): TodayReminder[] {
  const today = toDay(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  return habits
    .flatMap((habit): TodayReminder[] => {
      if (!habit.reminderTime) return [];
      const logs = logsFor(habit.id);
      if (!isHabitDue(habit, today, logs, weekStartsOn)) return [];

      const minutesUntil = minutesOfDay(habit.reminderTime) - nowMinutes;
      const status: ReminderStatus = completedDays(logs).has(today)
        ? 'done'
        : minutesUntil <= 0
          ? 'due'
          : 'upcoming';
      return [{ habitId: habit.id, time: habit.reminderTime, status, minutesUntil }];
    })
    .sort((a, b) => a.time.localeCompare(b.time) || a.habitId.localeCompare(b.habitId));
}

/**
 * The reminders to show as notifications right now. Built on remindersForDay, so a habit fires
 * exactly when the Today card turns it to "Due": it has a reminder time, it's due today (weekly:
 * not done yet this week), it isn't done today, and its time has passed. On top of that, the
 * time must have passed by less than REMINDER_WINDOW_MINUTES and the key must not have fired yet.
 */
export function remindersDue(
  habits: readonly ReminderHabit[],
  logsByHabit: ReadonlyMap<string, readonly HabitCompletion[]>,
  now: Date,
  firedKeys: ReadonlySet<string>,
  weekStartsOn: WeekStartsOn = 1,
): DueReminder[] {
  const today = toDay(now);
  return remindersForDay(habits, (id) => logsByHabit.get(id) ?? [], now, weekStartsOn)
    .filter((reminder) => reminder.status === 'due' && reminder.minutesUntil > -REMINDER_WINDOW_MINUTES)
    .map((reminder) => ({
      key: reminderKey(today, reminder.habitId, reminder.time),
      habitId: reminder.habitId,
      time: reminder.time,
    }))
    .filter((reminder) => !firedKeys.has(reminder.key));
}
