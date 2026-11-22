import { differenceInMinutes, format, isSameDay, parseISO } from 'date-fns';
import type { SyncStatus } from '../../../shared/ipc';

export interface SyncSummary {
  text: string;
  /** failed: opens the list of failed events. reconnect: goes to Settings. */
  tone: 'failed' | 'reconnect' | 'waiting' | 'synced';
  /** Longer wording for the tooltip. */
  title?: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "3:05 pm" */
export const clock12 = (date: Date) => format(date, 'h:mm a').toLowerCase();

/** "just now", "2 min ago", "at 3:05 pm" (today), "on 21 Nov at 3:05 pm". */
export function syncedAgo(at: Date, now: Date): string {
  const minutes = differenceInMinutes(now, at);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (isSameDay(at, now)) return `at ${clock12(at)}`;
  return `on ${format(at, 'd MMM')} at ${clock12(at)}`;
}

/** What the Calendar toolbar says about syncing, or null when there's nothing to say. */
export function describeSync(status: SyncStatus, now: Date): SyncSummary | null {
  const waiting = plural(status.pending, 'change waiting', 'changes waiting');

  if (status.connection === 'off') {
    // Edits to events that are already in Google wait for a reconnect.
    return status.pending > 0
      ? { text: `${waiting} · Google not connected`, tone: 'waiting', title: 'Connect Google Calendar in Settings to send them.' }
      : null;
  }
  if (status.connection === 'needs-reconnect') {
    return {
      text: 'Needs reconnect',
      tone: 'reconnect',
      title: `Google sign-in expired. ${status.pending > 0 ? `${waiting}. ` : ''}Reconnect in Settings.`,
    };
  }
  if (status.failed > 0) {
    return { text: plural(status.failed, 'event failed to sync', 'events failed to sync'), tone: 'failed' };
  }
  if (status.pending > 0) {
    return status.offline
      ? { text: `${waiting} · offline`, tone: 'waiting', title: 'They’ll go to Google when you’re back online.' }
      : { text: waiting, tone: 'waiting' };
  }
  if (!status.lastSyncedAt) return { text: 'Synced', tone: 'synced' };
  const at = parseISO(status.lastSyncedAt);
  return { text: `Synced ${syncedAgo(at, now)}`, tone: 'synced', title: `Last synced ${format(at, 'd MMM')}, ${clock12(at)}` };
}
