import { useEffect, useState } from 'react';
import type { EventInput, EventOccurrenceDto } from '../../../shared/ipc';

export interface EventsData {
  /** Occurrences in the range, or null while the current range hasn't loaded yet. */
  occurrences: EventOccurrenceDto[] | null;
  create(input: EventInput): Promise<void>;
  update(id: string, input: EventInput): Promise<void>;
  remove(id: string): Promise<void>;
  /** Repeating tasks need the occurrence's day; one-off tasks ignore it. */
  toggleTask(occurrence: EventOccurrenceDto): Promise<void>;
}

/**
 * Calendar items between two days (inclusive) plus the actions that change them.
 * Like useHabits, every action bumps `version`, which reloads the range.
 */
export function useEvents(fromDay: string, toDay: string): EventsData {
  const key = `${fromDay}|${toDay}`;
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; occurrences: EventOccurrenceDto[] } | null>(null);

  useEffect(() => {
    let current = true;
    void window.api.calendar.listInRange(fromDay, toDay).then((occurrences) => {
      if (current) setLoaded({ key, occurrences });
    });
    return () => {
      current = false;
    };
  }, [fromDay, toDay, key, version]);

  const after =
    <A extends unknown[]>(action: (...args: A) => Promise<unknown>) =>
    async (...args: A) => {
      await action(...args);
      setVersion((v) => v + 1);
    };

  return {
    occurrences: loaded?.key === key ? loaded.occurrences : null,
    create: after(window.api.calendar.create),
    update: after(window.api.calendar.update),
    remove: after(window.api.calendar.delete),
    toggleTask: after((occurrence: EventOccurrenceDto) =>
      window.api.calendar.toggleTaskDone(
        occurrence.event.id,
        occurrence.event.recurrenceRule ? occurrence.day : undefined,
      ),
    ),
  };
}
