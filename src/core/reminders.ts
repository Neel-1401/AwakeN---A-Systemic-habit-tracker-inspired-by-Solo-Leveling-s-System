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
