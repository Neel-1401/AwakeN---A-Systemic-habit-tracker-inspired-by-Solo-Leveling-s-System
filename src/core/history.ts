import type { WeekStartsOn } from './dates';
import { isHabitScheduled, weekKey, type HabitSchedule } from './habits';
import type { HabitLog } from './types';

/**
 * How one day looks for one habit:
 * - done: completed that day (even if it wasn't scheduled)
 * - missed: scheduled, in the past, not completed. For a weekly habit, a past week with no
 *   completion is missed on every day of it.
 * - pending: today (or this week, for weekly habits) and not completed yet
 * - unscheduled: nothing was asked of the habit that day
 * - future: after today
 */
export type DayStatus = 'done' | 'missed' | 'pending' | 'unscheduled' | 'future';

export function dayStatus(
  habit: HabitSchedule,
  day: string,
  completed: ReadonlySet<string>,
  today: string,
  weekStartsOn: WeekStartsOn = 1,
): DayStatus {
  if (completed.has(day)) return 'done';
  if (day > today) return 'future';
  if (!isHabitScheduled(habit, day)) return 'unscheduled';

  if (habit.frequency === 'weekly') {
    const week = weekKey(day, weekStartsOn);
    if ([...completed].some((doneDay) => weekKey(doneDay, weekStartsOn) === week)) {
      return 'unscheduled';
    }
    return week === weekKey(today, weekStartsOn) ? 'pending' : 'missed';
  }
  return day === today ? 'pending' : 'missed';
}

/** Splits a mixed list of logs by habit, so each habit's logs can go to the core functions. */
export function groupLogsByHabit<T extends Pick<HabitLog, 'habitId'>>(
  logs: readonly T[],
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const log of logs) {
    const group = groups.get(log.habitId);
    if (group) group.push(log);
    else groups.set(log.habitId, [log]);
  }
  return groups;
}
