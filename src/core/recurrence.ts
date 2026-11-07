import { addDays, differenceInCalendarDays, getDay, isValid, parseISO } from 'date-fns';
import type { CalendarEvent } from './types';

export type RepeatKind = 'daily' | 'weekly' | 'weekdays';

/** Stored in recurrenceRule. These are RFC 5545 strings so they can go to Google unchanged. */
export const RECURRENCE_RULES: Record<RepeatKind, string> = {
  daily: 'RRULE:FREQ=DAILY',
  weekly: 'RRULE:FREQ=WEEKLY',
  weekdays: 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
};

export type RecurringEvent = Pick<CalendarEvent, 'startAt' | 'endAt' | 'recurrenceRule'>;

export interface Occurrence<T extends RecurringEvent> {
  event: T;
  start: Date;
  end: Date;
}

/** Returns the repeat kind, or null when there is no rule or the rule isn't one we support. */
export function parseRecurrenceRule(rule: string | null | undefined): RepeatKind | null {
  const normalized = rule?.trim().toUpperCase();
  const kinds = Object.keys(RECURRENCE_RULES) as RepeatKind[];
  return kinds.find((kind) => RECURRENCE_RULES[kind] === normalized) ?? null;
}

function repeatsAt(repeat: RepeatKind, offset: number, date: Date): boolean {
  if (repeat === 'daily') return true;
  if (repeat === 'weekly') return offset % 7 === 0;
  const weekday = getDay(date);
  return weekday >= 1 && weekday <= 5;
}

function overlapsRange(start: Date, end: Date, rangeStart: Date, rangeEnd: Date): boolean {
  // A zero-length item, such as a task, counts as being at its start time.
  return start < rangeEnd && (end > rangeStart || start >= rangeStart);
}

/**
 * The occurrences overlapping [rangeStart, rangeEnd), in order. Each one keeps the local clock
 * times of the original, including across daylight saving changes. The event's own start is
 * always an occurrence. An unsupported rule is treated as not repeating; use
 * parseRecurrenceRule to detect that case.
 */
export function expandEvent<T extends RecurringEvent>(
  event: T,
  rangeStart: Date,
  rangeEnd: Date,
): Occurrence<T>[] {
  const baseStart = parseISO(event.startAt);
  const baseEnd = parseISO(event.endAt);
  if (![baseStart, baseEnd, rangeStart, rangeEnd].every(isValid)) return [];

  const repeat = parseRecurrenceRule(event.recurrenceRule);
  const spanDays = Math.max(0, differenceInCalendarDays(baseEnd, baseStart));
  // Jump close to the range so old events don't walk every day since they began.
  const firstOffset = repeat
    ? Math.max(0, differenceInCalendarDays(rangeStart, baseStart) - spanDays - 1)
    : 0;

  const occurrences: Occurrence<T>[] = [];
  for (let offset = firstOffset; ; offset += 1) {
    const start = addDays(baseStart, offset);
    if (start >= rangeEnd) break;

    if (offset === 0 || (repeat && repeatsAt(repeat, offset, start))) {
      const end = addDays(baseEnd, offset);
      if (overlapsRange(start, end, rangeStart, rangeEnd)) {
        occurrences.push({ event, start, end });
      }
    }
    if (!repeat) break;
  }
  return occurrences;
}
