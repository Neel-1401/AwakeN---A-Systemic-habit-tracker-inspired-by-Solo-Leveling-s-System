import { useCallback, useEffect, useState } from 'react';
import type { Habit, HabitLog } from '../../../core/types';
import type { HabitInput } from '../../../shared/ipc';

/** Logs are loaded from here, so streaks see every completion, backfilled ones included. */
const EARLIEST_DAY = '1970-01-01';

export interface HabitData {
  /** null until the first load finishes */
  habits: Habit[] | null;
  logs: HabitLog[];
  create(input: HabitInput): Promise<void>;
  update(id: string, input: HabitInput): Promise<void>;
  archive(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  toggle(habitId: string, day: string): Promise<void>;
}

/**
 * Loads habits and logs from main and reloads after every change. The database is the only
 * source of truth: the UI never edits its own copy, it asks main and then re-reads.
 * Actions reject with main's error so the caller can show it.
 */
export function useHabitData(today: string): HabitData {
  const [habits, setHabits] = useState<Habit[] | null>(null);
  const [logs, setLogs] = useState<HabitLog[]>([]);

  // useCallback keeps the same function between renders unless `today` changes, so the effect
  // below only re-runs (and reloads) when the date actually rolls over.
  const reload = useCallback(async () => {
    const [nextHabits, nextLogs] = await Promise.all([
      window.api.habits.list(),
      window.api.habits.getLogs(EARLIEST_DAY, today),
    ]);
    setHabits(nextHabits);
    setLogs(nextLogs);
  }, [today]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const after =
    <A extends unknown[]>(action: (...args: A) => Promise<unknown>) =>
    async (...args: A) => {
      await action(...args);
      await reload();
    };

  return {
    habits,
    logs,
    create: after(window.api.habits.create),
    update: after(window.api.habits.update),
    archive: after(window.api.habits.archive),
    restore: after(window.api.habits.restore),
    remove: after(window.api.habits.delete),
    toggle: after(window.api.habits.toggleLog),
  };
}
