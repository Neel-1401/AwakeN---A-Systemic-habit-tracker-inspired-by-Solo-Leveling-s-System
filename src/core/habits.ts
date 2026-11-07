import { getDay, parseISO, startOfWeek } from 'date-fns';
import { parseDay, toDay, type WeekStartsOn } from './dates';
import type { Habit, HabitLog } from './types';

export type HabitSchedule = Pick<Habit, 'frequency' | 'weekdays' | 'archivedAt'> & {
  startDate: string;
};

export type HabitCompletion = Pick<HabitLog, 'date' | 'deletedAt'>;

/** The days with a live completion. Undoing a completion soft-deletes its log. */
export function completedDays(logs: readonly HabitCompletion[]): Set<string> {
  return new Set(logs.filter((log) => !log.deletedAt).map((log) => log.date));
}

/** The local day a habit was archived. The habit stops being scheduled from this day on. */
export function archiveDay(habit: Pick<Habit, 'archivedAt'>): string | null {
  return habit.archivedAt ? toDay(parseISO(habit.archivedAt)) : null;
}

export function weekKey(day: string, weekStartsOn: WeekStartsOn): string {
  return toDay(startOfWeek(parseDay(day), { weekStartsOn }));
}

/** Whether the habit's schedule covers this day, ignoring what has been completed. */
export function isHabitScheduled(habit: HabitSchedule, day: string): boolean {
  const date = parseDay(day);
  const archived = archiveDay(habit);
  if (day < habit.startDate || (archived !== null && day >= archived)) return false;
  if (habit.frequency === 'weekdays') return habit.weekdays?.includes(getDay(date)) ?? false;
  return true;
}

/**
 * Whether the habit belongs on this day's list. A weekly habit can be done on any day of its
 * week, so it is due until completed. It stays due on the completing day so it can be undone.
 */
export function isHabitDue(
  habit: HabitSchedule,
  day: string,
  logs: readonly HabitCompletion[],
  weekStartsOn: WeekStartsOn = 1,
): boolean {
  if (!isHabitScheduled(habit, day)) return false;
  if (habit.frequency !== 'weekly') return true;

  const completed = completedDays(logs);
  if (completed.has(day)) return true;
  const week = weekKey(day, weekStartsOn);
  return ![...completed].some((completedDay) => weekKey(completedDay, weekStartsOn) === week);
}
