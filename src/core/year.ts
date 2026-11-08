import { addDays, eachDayOfInterval, endOfWeek, startOfWeek } from 'date-fns';
import { toDay, type WeekStartsOn } from './dates';
import { completedDays, isHabitScheduled, weekKey, type HabitCompletion, type HabitSchedule } from './habits';
import { dayStatus } from './history';
import { completionRate, type DayEntry } from './month';
import { calculateStreaks } from './streaks';

export type HeatLevel = 0 | 1 | 2 | 3 | 4;

/**
 * One square of a heatmap.
 * - level: something was scheduled. 0 = none of it done, 4 = all of it done.
 * - unscheduled: nothing was asked that day.
 * - future: after today.
 */
export type HeatmapDay =
  | { day: string; kind: 'level'; level: HeatLevel; done: number; scheduled: number }
  | { day: string; kind: 'unscheduled' }
  | { day: string; kind: 'future' };

export interface HabitYear {
  days: HeatmapDay[];
  /** Done ÷ (done + missed), as in the month rate. Weekly habits count weeks. */
  percent: number | null;
  daysDone: number;
  bestStreak: number;
}

export interface OverallYear {
  days: HeatmapDay[];
  /** Completed ÷ scheduled habit-days this year (weekly habits excluded). */
  percent: number | null;
  /** Completions on scheduled days this year (weekly habits excluded). */
  checkIns: number;
}

export function yearDays(year: number): string[] {
  return eachDayOfInterval({ start: new Date(year, 0, 1), end: new Date(year, 11, 31) }).map(toDay);
}

/**
 * One habit's year. Done days are level 4; missed days and today-not-done-yet are level 0.
 * Best streak is the longest run inside this year. Pass logs from at least 6 days either side
 * of the year so weekly habits see whole weeks.
 */
export function yearHeatmap(
  habit: HabitSchedule,
  logs: readonly HabitCompletion[],
  year: number,
  today: string,
  weekStartsOn: WeekStartsOn = 1,
): HabitYear {
  const completed = completedDays(logs);
  const entries: DayEntry[] = yearDays(year).map((day) => ({
    day,
    status: dayStatus(habit, day, completed, today, weekStartsOn),
  }));

  const days: HeatmapDay[] = entries.map(({ day, status }) => {
    if (status === 'future') return { day, kind: 'future' };
    if (status === 'unscheduled') return { day, kind: 'unscheduled' };
    const done = status === 'done' ? 1 : 0;
    return { day, kind: 'level', level: done ? 4 : 0, done, scheduled: 1 };
  });

  const first = `${year}-01-01`;
  const last = `${year}-12-31`;
  const yearLogs = logs.filter((log) => log.date >= first && log.date <= last);
  const streakEnd = today < last ? today : last;
  const bestStreak =
    streakEnd < first
      ? 0
      : calculateStreaks(
          { ...habit, startDate: habit.startDate > first ? habit.startDate : first },
          yearLogs,
          streakEnd,
          weekStartsOn,
        ).best;

  return {
    days,
    percent: habit.frequency === 'weekly' ? weeklyPercent(entries, weekStartsOn) : completionRate(habit, entries).percent,
    daysDone: entries.filter((entry) => entry.status === 'done').length,
    bestStreak,
  };
}

function weeklyPercent(entries: readonly DayEntry[], weekStartsOn: WeekStartsOn): number | null {
  const doneWeeks = new Set<string>();
  const missedWeeks = new Set<string>();
  for (const { day, status } of entries) {
    if (status === 'done') doneWeeks.add(weekKey(day, weekStartsOn));
    else if (status === 'missed') missedWeeks.add(weekKey(day, weekStartsOn));
  }
  const total = doneWeeks.size + missedWeeks.size;
  return total ? Math.round((doneWeeks.size / total) * 100) : null;
}

/** Share of scheduled habits done → 0 (none) … 4 (all). Any progress is at least level 1. */
export function shareToLevel(done: number, scheduled: number): HeatLevel {
  if (scheduled === 0 || done === 0) return 0;
  return Math.max(1, Math.min(4, Math.ceil((done / scheduled) * 4))) as HeatLevel;
}

/**
 * All habits together, per day: how many of that day's scheduled habits were done.
 * Weekly habits are left out because they aren't tied to a particular day. Today counts only
 * the habits already done, so it never shows as worse than it is.
 */
export function overallYearHeatmap(
  habits: readonly (HabitSchedule & { id: string })[],
  logsByHabit: ReadonlyMap<string, readonly HabitCompletion[]>,
  year: number,
  today: string,
): OverallYear {
  const dayBased = habits.filter((habit) => habit.frequency !== 'weekly');
  const completed = new Map(dayBased.map((habit) => [habit.id, completedDays(logsByHabit.get(habit.id) ?? [])]));

  let totalDone = 0;
  let totalScheduled = 0;
  const days: HeatmapDay[] = yearDays(year).map((day) => {
    if (day > today) return { day, kind: 'future' };
    let scheduled = 0;
    let done = 0;
    for (const habit of dayBased) {
      if (!isHabitScheduled(habit, day)) continue;
      const isDone = completed.get(habit.id)!.has(day);
      if (day === today && !isDone) continue;
      scheduled += 1;
      if (isDone) done += 1;
    }
    if (scheduled === 0) return { day, kind: 'unscheduled' };
    totalDone += done;
    totalScheduled += scheduled;
    return { day, kind: 'level', level: shareToLevel(done, scheduled), done, scheduled };
  });

  return {
    days,
    percent: totalScheduled ? Math.round((totalDone / totalScheduled) * 100) : null,
    checkIns: totalDone,
  };
}

export interface YearLayout {
  /** columns[c][r]: the day in week c, row r (row 0 = first day of the week), or null outside the year. */
  columns: (string | null)[][];
  /** The column holding the 1st of each month, for month labels. month is 1–12. */
  monthStarts: { month: number; column: number }[];
}

/** Lays a year out as week columns × 7 weekday rows, like a contribution graph. */
export function yearLayout(year: number, weekStartsOn: WeekStartsOn = 1): YearLayout {
  const first = new Date(year, 0, 1);
  const last = new Date(year, 11, 31);
  const start = startOfWeek(first, { weekStartsOn });
  const end = endOfWeek(last, { weekStartsOn });

  const columns: (string | null)[][] = [];
  const monthStarts: { month: number; column: number }[] = [];
  for (let date = start, index = 0; date <= end; date = addDays(date, 1), index += 1) {
    const column = Math.floor(index / 7);
    if (index % 7 === 0) columns.push([]);
    const inYear = date.getFullYear() === year;
    columns[column].push(inYear ? toDay(date) : null);
    if (inYear && date.getDate() === 1) monthStarts.push({ month: date.getMonth() + 1, column });
  }
  return { columns, monthStarts };
}
