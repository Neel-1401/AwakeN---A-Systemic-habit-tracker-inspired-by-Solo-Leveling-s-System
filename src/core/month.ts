import { eachDayOfInterval, endOfMonth, getDay } from 'date-fns';
import { parseDay, toDay, type WeekStartsOn } from './dates';
import { completedDays, weekKey, type HabitCompletion, type HabitSchedule } from './habits';
import { dayStatus, type DayStatus } from './history';

export interface DayEntry {
  day: string;
  status: DayStatus;
}

/** Daily and chosen-day habits get a percentage; weekly habits count weeks instead. */
export type MonthRate =
  | { kind: 'percent'; percent: number | null; done: number; scheduled: number }
  | { kind: 'weeks'; weeks: number };

export interface MonthGrid {
  days: DayEntry[];
  rate: MonthRate;
}

/** Every day of a month as YYYY-MM-DD. `month` is 1–12. */
export function monthDays(year: number, month: number): string[] {
  const start = new Date(year, month - 1, 1);
  return eachDayOfInterval({ start, end: endOfMonth(start) }).map(toDay);
}

/** Whether the habit's repeat rule covers this weekday, ignoring start and archive dates. */
function runsOnWeekday(habit: HabitSchedule, day: Date): boolean {
  return habit.frequency !== 'weekdays' || (habit.weekdays?.includes(getDay(day)) ?? false);
}

/**
 * Done ÷ (done + missed) over the given days, as a whole percentage.
 * - Today, if not done yet ("pending"), is left out, so the rate doesn't drop each morning.
 * - A completion only counts on a day the habit's rule covers, so ticking a chosen-days habit on
 *   an off day can't push the rate past 100%. Backfills before the start date do count.
 * `percent` is null when there's nothing to measure yet.
 */
export function completionRate(
  habit: HabitSchedule,
  days: readonly DayEntry[],
): { percent: number | null; done: number; scheduled: number } {
  let done = 0;
  let missed = 0;
  for (const { day, status } of days) {
    if (status === 'missed') missed += 1;
    else if (status === 'done' && runsOnWeekday(habit, parseDay(day))) done += 1;
  }
  const scheduled = done + missed;
  return { percent: scheduled ? Math.round((done / scheduled) * 100) : null, done, scheduled };
}

/**
 * One entry per day of the month with its status, plus the month's rate.
 * Weekly habits' statuses depend on the whole week, so pass logs from at least 6 days either
 * side of the month. Weekly rate = weeks with a completion inside this month.
 */
export function monthGrid(
  habit: HabitSchedule,
  logs: readonly HabitCompletion[],
  year: number,
  month: number,
  today: string,
  weekStartsOn: WeekStartsOn = 1,
): MonthGrid {
  const completed = completedDays(logs);
  const days = monthDays(year, month).map((day) => ({
    day,
    status: dayStatus(habit, day, completed, today, weekStartsOn),
  }));

  if (habit.frequency === 'weekly') {
    const weeks = new Set(
      days.filter((entry) => entry.status === 'done').map((entry) => weekKey(entry.day, weekStartsOn)),
    );
    return { days, rate: { kind: 'weeks', weeks: weeks.size } };
  }
  return { days, rate: { kind: 'percent', ...completionRate(habit, days) } };
}
