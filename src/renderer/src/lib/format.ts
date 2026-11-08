import type { WeekStartsOn } from '../../../core/dates';
import type { Habit } from '../../../core/types';

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Weekday numbers (0 = Sunday) in display order for the week-start setting. */
export function orderedWeekdays(weekStartsOn: WeekStartsOn): number[] {
  return [0, 1, 2, 3, 4, 5, 6].map((offset) => (offset + weekStartsOn) % 7);
}

/** "Every day", "Once a week", "Weekdays", or a list like "Mon, Wed, Fri". */
export function describeSchedule(
  habit: Pick<Habit, 'frequency' | 'weekdays'>,
  weekStartsOn: WeekStartsOn,
): string {
  if (habit.frequency === 'daily') return 'Every day';
  if (habit.frequency === 'weekly') return 'Once a week';

  const days = new Set(habit.weekdays ?? []);
  if (days.size === 7) return 'Every day';
  if (days.size === 5 && [1, 2, 3, 4, 5].every((day) => days.has(day))) return 'Weekdays';
  if (days.size === 2 && days.has(0) && days.has(6)) return 'Weekends';
  return orderedWeekdays(weekStartsOn)
    .filter((day) => days.has(day))
    .map((day) => WEEKDAY_SHORT[day])
    .join(', ');
}

export { formatTime } from '../../../shared/format';

/** 130 → "in 2h 10m", 45 → "in 45m", 120 → "in 2h" */
export function formatCountdown(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `in ${rest}m`;
  return rest === 0 ? `in ${hours}h` : `in ${hours}h ${rest}m`;
}

/**
 * Electron wraps errors thrown in main as
 * "Error invoking remote method 'habits:create': ValidationError: Name is required".
 * This keeps just the last part.
 */
export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '');
}
