import { addDays, differenceInMinutes } from 'date-fns';
import { parseDay, toDay } from './dates';
import { expandEvent, type RecurringEvent } from './recurrence';

/**
 * How events are stored:
 * - Timed events: startAt / endAt are UTC ISO strings ("2026-11-09T03:30:00.000Z") and are shown
 *   in local time.
 * - All-day events: startAt / endAt are day keys ("2026-11-09"), with endAt EXCLUSIVE, the way
 *   Google Calendar does it. A one-day event on the 9th is 2026-11-09 → 2026-11-10. Day keys have
 *   no time zone, so an all-day event never slides to the neighbouring day.
 */
export type CalendarItem = RecurringEvent & { allDay: boolean };

export interface EventOccurrence<T extends CalendarItem> {
  event: T;
  /** The local day this occurrence starts on. Used as the key for per-day task completion. */
  day: string;
  /** Timed: UTC ISO string. All-day: day key. */
  startAt: string;
  /** Timed: UTC ISO string. All-day: day key, exclusive. */
  endAt: string;
  start: Date;
  end: Date;
}

/**
 * Every occurrence of an event that overlaps the local days fromDay..lastDay (inclusive), in order.
 * Repeating events follow the rules in recurrence.ts: local clock times are kept, and the
 * event's own first date is always an occurrence.
 */
export function occurrencesInRange<T extends CalendarItem>(
  event: T,
  fromDay: string,
  lastDay: string,
): EventOccurrence<T>[] {
  const rangeStart = parseDay(fromDay);
  const rangeEnd = addDays(parseDay(lastDay), 1);
  return expandEvent(event, rangeStart, rangeEnd).map(({ start, end }) => ({
    event,
    day: toDay(start),
    startAt: event.allDay ? toDay(start) : start.toISOString(),
    endAt: event.allDay ? toDay(end) : end.toISOString(),
    start,
    end,
  }));
}

/** True when an occurrence of the event starts on `day`. Used to check task-completion days. */
export function occursOn(event: CalendarItem, day: string): boolean {
  return occurrencesInRange(event, day, day).some((occurrence) => occurrence.day === day);
}

export interface LayoutInput {
  id: string;
  start: Date;
  end: Date;
}

export interface LaidOut {
  id: string;
  /** Minutes from the start of the day, clipped to the day. */
  top: number;
  bottom: number;
  /** Which side-by-side column this event sits in, and how many columns its group has. */
  column: number;
  columns: number;
}

const MINUTES_PER_DAY = 24 * 60;

/**
 * Places a day's timed events in a time grid. Events that overlap share the width: each gets a
 * column index and the number of columns in its overlapping group. Events crossing midnight are
 * clipped to this day. Very short events (tasks with no duration) are treated as at least
 * `minMinutes` long so they stay visible and don't sit on top of each other.
 */
export function layoutDay(items: readonly LayoutInput[], day: string, minMinutes = 30): LaidOut[] {
  const dayStart = parseDay(day);
  const placed = items
    .map((item) => ({
      id: item.id,
      startMin: differenceInMinutes(item.start, dayStart),
      endMin: differenceInMinutes(item.end, dayStart),
    }))
    // Keep events that touch this day: they start before midnight tonight and end after
    // midnight this morning (a zero-length task at exactly 00:00 counts too).
    .filter(({ startMin, endMin }) => startMin < MINUTES_PER_DAY && (endMin > 0 || startMin === 0))
    .map(({ id, startMin, endMin }) => {
      const top = Math.max(0, startMin);
      const bottom = Math.min(MINUTES_PER_DAY, Math.max(endMin, top + minMinutes));
      return { id, top, bottom, column: 0, columns: 1 };
    })
    // Earlier first; for equal starts, the longer event takes the left column.
    .sort((a, b) => a.top - b.top || b.bottom - a.bottom || a.id.localeCompare(b.id));

  // Walk through the day in groups of events that overlap each other (directly or via a chain).
  let group: typeof placed = [];
  let columnEnds: number[] = [];
  let groupEnd = -1;
  const closeGroup = () => {
    for (const item of group) item.columns = columnEnds.length;
    group = [];
    columnEnds = [];
  };

  for (const item of placed) {
    if (item.top >= groupEnd) closeGroup();
    // Use the first column that's free by the time this event starts.
    let column = columnEnds.findIndex((end) => end <= item.top);
    if (column === -1) column = columnEnds.length;
    columnEnds[column] = item.bottom;
    item.column = column;
    group.push(item);
    groupEnd = Math.max(groupEnd, item.bottom);
  }
  closeGroup();

  return placed.map(({ id, top, bottom, column, columns }) => ({ id, top, bottom, column, columns }));
}
