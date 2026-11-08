import { useEffect, useState } from 'react';

/**
 * The current time, updated at the start of every minute, so "in 2h 10m" and Due/Done change
 * exactly when the clock does. It also updates when the window regains focus: timers are paused
 * while the computer sleeps, so the time could otherwise be stale for up to a minute after waking.
 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const current = new Date();
      setNow(current);
      // Wait until the next whole minute (plus a little, so we land just after it).
      const msToNextMinute = 60_000 - (current.getSeconds() * 1000 + current.getMilliseconds()) + 50;
      timer = setTimeout(tick, msToNextMinute);
    };
    const onFocus = () => {
      clearTimeout(timer);
      tick();
    };
    tick();
    window.addEventListener('focus', onFocus);
    // React calls this cleanup when the component goes away, so nothing keeps running.
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return now;
}
