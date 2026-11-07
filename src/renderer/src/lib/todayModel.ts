import type { WeekStartsOn } from '../../../core/dates';
import { completedDays, isHabitDue } from '../../../core/habits';
import { groupLogsByHabit } from '../../../core/history';
import { calculateStreaks, type Streaks } from '../../../core/streaks';
import type { Habit, HabitLog } from '../../../core/types';

export interface HabitView {
  habit: Habit;
  logs: HabitLog[];
  completed: ReadonlySet<string>;
  streaks: Streaks;
  doneToday: boolean;
}

export interface TodayModel {
  due: HabitView[];
  notScheduled: HabitView[];
  archived: Habit[];
  doneCount: number;
}

/** Sorts habits into the Today lists. All the date rules come from src/core. */
export function buildTodayModel(
  habits: readonly Habit[],
  logs: readonly HabitLog[],
  today: string,
  weekStartsOn: WeekStartsOn,
): TodayModel {
  const byHabit = groupLogsByHabit(logs);
  const model: TodayModel = { due: [], notScheduled: [], archived: [], doneCount: 0 };

  for (const habit of habits) {
    if (habit.archivedAt) {
      model.archived.push(habit);
      continue;
    }
    const habitLogs = byHabit.get(habit.id) ?? [];
    const completed = completedDays(habitLogs);
    const view: HabitView = {
      habit,
      logs: habitLogs,
      completed,
      streaks: calculateStreaks(habit, habitLogs, today, weekStartsOn),
      doneToday: completed.has(today),
    };
    if (isHabitDue(habit, today, habitLogs, weekStartsOn)) {
      model.due.push(view);
      if (view.doneToday) model.doneCount += 1;
    } else {
      model.notScheduled.push(view);
    }
  }
  return model;
}
