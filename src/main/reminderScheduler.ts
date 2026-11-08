import type Database from 'better-sqlite3';
import { Notification, powerMonitor } from 'electron';
import { checkReminders } from './reminderCheck';

const CHECK_EVERY_MS = 30_000;

/**
 * Shows a quiet desktop notification. Clicking it calls `onClick`.
 * Notifications are kept in a set until clicked: if the object were garbage-collected, a click
 * on the toast (even later, from the Windows notification centre) would do nothing.
 */
const live = new Set<Notification>();

export function showNotification(title: string, body: string, onClick: () => void): void {
  const notification = new Notification({ title, body, silent: true });
  live.add(notification);
  notification.on('click', () => {
    live.delete(notification);
    onClick();
  });
  notification.on('failed', (_event, error) => {
    live.delete(notification);
    console.warn(`Notification failed: ${error}`);
  });
  notification.show();
}

/**
 * Checks for due habit reminders right away, then every 30 seconds, and again when the computer
 * wakes from sleep (timers don't run while it's asleep). Returns a function that stops it.
 */
export function startReminderScheduler(db: Database.Database, onClick: () => void): () => void {
  let warnedUnsupported = false;

  const check = () => {
    if (!Notification.isSupported()) {
      if (!warnedUnsupported) {
        console.warn('Desktop notifications are not supported here, so habit reminders will not show.');
        warnedUnsupported = true;
      }
      return;
    }
    try {
      for (const notice of checkReminders(db)) showNotification(notice.title, notice.body, onClick);
    } catch (error) {
      // One bad check shouldn't stop the timer; the next one may work.
      console.error('Reminder check failed:', error instanceof Error ? error.message : error);
    }
  };

  check();
  const timer = setInterval(check, CHECK_EVERY_MS);
  powerMonitor.on('resume', check);
  return () => {
    clearInterval(timer);
    powerMonitor.off('resume', check);
  };
}
