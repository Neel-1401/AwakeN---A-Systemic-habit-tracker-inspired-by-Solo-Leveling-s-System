import { useEffect, useState } from 'react';

/**
 * The current time, refreshed every `intervalMs`. Components that show "today" or a countdown
 * use this so they update on their own, including when the date rolls over at midnight.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    // React calls this cleanup when the component goes away, so the timer doesn't leak.
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
