import { useEffect, useState } from 'react';
import type { Habit } from '../../../core/types';
import type { HabitInput } from '../../../shared/ipc';

export interface HabitsData {
  /** null until the first load finishes. Archived habits are included. */
  habits: Habit[] | null;
  /**
   * Goes up by one after every change. Log queries list it as a dependency, so they re-run
   * after a toggle or an edit without each view having to know what changed.
   */
  version: number;
  create(input: HabitInput): Promise<void>;
  update(id: string, input: HabitInput): Promise<void>;
  archive(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  toggle(habitId: string, day: string): Promise<void>;
}

/**
 * The habit list plus every action that changes habits or logs. Actions reject with main's
 * error message so the caller can show it.
 */
export function useHabits(): HabitsData {
  const [habits, setHabits] = useState<Habit[] | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    // If a newer load starts before this one finishes, ignore this one's result.
    let current = true;
    void window.api.habits.list().then((list) => {
      if (current) setHabits(list);
    });
    return () => {
      current = false;
    };
  }, [version]);

  const after =
    <A extends unknown[]>(action: (...args: A) => Promise<unknown>) =>
    async (...args: A) => {
      await action(...args);
      setVersion((v) => v + 1);
    };

  return {
    habits,
    version,
    create: after(window.api.habits.create),
    update: after(window.api.habits.update),
    archive: after(window.api.habits.archive),
    restore: after(window.api.habits.restore),
    remove: after(window.api.habits.delete),
    toggle: after(window.api.habits.toggleLog),
  };
}
