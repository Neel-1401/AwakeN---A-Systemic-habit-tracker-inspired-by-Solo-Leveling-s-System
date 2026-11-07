import { eachDayOfInterval, eachWeekOfInterval, subDays } from 'date-fns';
import { parseDay, toDay, type WeekStartsOn } from './dates';
import {
  archiveDay,
  completedDays,
  isHabitScheduled,
  weekKey,
  type HabitCompletion,
  type HabitSchedule,
} from './habits';

export interface Streaks {
  current: number;
  best: number;
}

/** One scheduled day, or one week for weekly habits. */
interface StreakUnit {
  done: boolean;
  /** Still in progress, so being incomplete doesn't break the streak yet. */
  open: boolean;
}

function dailyUnits(
  habit: HabitSchedule,
  days: readonly string[],
  completed: ReadonlySet<string>,
  today: string,
): StreakUnit[] {
  return days
    .filter((day) => isHabitScheduled(habit, day))
    .map((day) => ({ done: completed.has(day), open: day === today }));
}

function weeklyUnits(
  start: Date,
  end: Date,
  completed: ReadonlySet<string>,
  today: string,
  weekStartsOn: WeekStartsOn,
): StreakUnit[] {
  const doneWeeks = new Set([...completed].map((day) => weekKey(day, weekStartsOn)));
  const currentWeek = weekKey(today, weekStartsOn);
  return eachWeekOfInterval({ start, end }, { weekStartsOn }).map((weekStart) => {
    const week = toDay(weekStart);
    return { done: doneWeeks.has(week), open: week === currentWeek };
  });
}

/**
 * Current and best streak, derived from logs. Completions on unscheduled days neither extend
 * nor break a streak. Backfilled completions before startDate do count, and move the start of
 * the streak history back to the earliest one.
 */
export function calculateStreaks(
  habit: HabitSchedule,
  logs: readonly HabitCompletion[],
  today: string,
  weekStartsOn: WeekStartsOn = 1,
): Streaks {
  const archived = archiveDay(habit);
  const dayBeforeArchive = archived ? toDay(subDays(parseDay(archived), 1)) : null;
  const lastDay = dayBeforeArchive !== null && dayBeforeArchive < today ? dayBeforeArchive : today;

  const completed = new Set([...completedDays(logs)].filter((day) => day <= lastDay));
  const firstDay = [habit.startDate, ...completed].sort()[0];
  if (firstDay > lastDay) return { current: 0, best: 0 };

  const start = parseDay(firstDay);
  const end = parseDay(lastDay);
  const units =
    habit.frequency === 'weekly'
      ? weeklyUnits(start, end, completed, today, weekStartsOn)
      : dailyUnits(
          { ...habit, startDate: firstDay },
          eachDayOfInterval({ start, end }).map(toDay),
          completed,
          today,
        );

  let current = 0;
  let best = 0;
  for (const unit of units) {
    if (unit.done) {
      current += 1;
      best = Math.max(best, current);
    } else if (!unit.open) {
      current = 0;
    }
  }
  return { current, best };
}
