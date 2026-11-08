import { useEffect, useState } from 'react';
import type { HabitLog } from '../../../core/types';

/**
 * Completions between two days (inclusive). Reloads when the range or `version` changes.
 * Returns null while the current range hasn't loaded yet, so a view never draws one month
 * with another month's logs.
 */
export function useLogs(fromDay: string, toDay: string, version: number): HabitLog[] | null {
  const key = `${fromDay}|${toDay}`;
  const [loaded, setLoaded] = useState<{ key: string; logs: HabitLog[] } | null>(null);

  useEffect(() => {
    let current = true;
    void window.api.habits.getLogs(fromDay, toDay).then((logs) => {
      if (current) setLoaded({ key, logs });
    });
    return () => {
      current = false;
    };
  }, [fromDay, toDay, key, version]);

  return loaded?.key === key ? loaded.logs : null;
}
