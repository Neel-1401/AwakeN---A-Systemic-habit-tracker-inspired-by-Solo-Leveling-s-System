import { format, parseISO } from 'date-fns';
import type { EventOccurrenceDto } from '../../../shared/ipc';
import { formatTime } from '../lib/format';
import { WarningIcon } from './SyncStatus';
import './CalendarItem.css';

/** A unique key for one occurrence (a repeating event has many with the same id). */
export const occurrenceKey = (o: EventOccurrenceDto) => `${o.event.id}|${o.startAt}`;

/** "9:00 am" for a stored UTC time, in local time. */
export const clockTime = (iso: string) => formatTime(format(parseISO(iso), 'HH:mm'));

/** What a screen reader hears for an item, e.g. "Lab report, task, done, 5:00 pm to 5:30 pm, repeats". */
export function occurrenceLabel(o: EventOccurrenceDto): string {
  const parts = [o.event.title];
  if (o.event.kind === 'task') parts.push(o.done ? 'task, done' : 'task');
  parts.push(o.event.allDay ? 'all day' : `${clockTime(o.startAt)} to ${clockTime(o.endAt)}`);
  if (o.event.recurrenceRule) parts.push('repeats');
  if (o.event.syncState === 'error') parts.push('didn’t sync to Google Calendar');
  return parts.join(', ');
}

/** The warning triangle on an item Google refused. The reason shows on hover. */
export function SyncFailedMark({ occurrence }: { occurrence: EventOccurrenceDto }) {
  if (occurrence.event.syncState !== 'error') return null;
  return <WarningIcon title={occurrence.event.syncError ?? 'Didn’t sync to Google Calendar'} />;
}

interface TaskCheckProps {
  occurrence: EventOccurrenceDto;
  onToggle(): void;
  /** -1 keeps it out of the Tab order (the Month view reaches items through Day view instead). */
  tabIndex?: number;
}

/** The round tick box on a task. A separate button, so it never opens the dialog. */
export function TaskCheck({ occurrence, onToggle, tabIndex }: TaskCheckProps) {
  return (
    <button
      type="button"
      className="cal-check"
      tabIndex={tabIndex}
      aria-pressed={occurrence.done}
      aria-label={`${occurrence.event.title}: ${occurrence.done ? 'done, press to undo' : 'mark done'}`}
      onClick={onToggle}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4 8.5l2.5 2.5L12 5.5" />
      </svg>
    </button>
  );
}
