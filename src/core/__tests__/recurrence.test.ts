import { describe, expect, it } from 'vitest';
import {
  RECURRENCE_RULES,
  expandEvent,
  parseRecurrenceRule,
  type RecurringEvent,
} from '../recurrence';

// March 2026: the 2nd is a Monday. All times are local.
function at(day: number, hour = 0, minute = 0): Date {
  return new Date(2026, 2, day, hour, minute);
}

function event(start: Date, end: Date, recurrenceRule?: string | null): RecurringEvent {
  return { startAt: start.toISOString(), endAt: end.toISOString(), recurrenceRule };
}

function startDays(occurrences: { start: Date }[]): number[] {
  return occurrences.map((occurrence) => occurrence.start.getDate());
}

describe('parseRecurrenceRule', () => {
  it('recognises each supported rule', () => {
    expect(parseRecurrenceRule(RECURRENCE_RULES.daily)).toBe('daily');
    expect(parseRecurrenceRule(RECURRENCE_RULES.weekly)).toBe('weekly');
    expect(parseRecurrenceRule(RECURRENCE_RULES.weekdays)).toBe('weekdays');
  });

  it('returns null for no rule and for rules it cannot honour', () => {
    expect(parseRecurrenceRule(null)).toBeNull();
    expect(parseRecurrenceRule(undefined)).toBeNull();
    expect(parseRecurrenceRule('RRULE:FREQ=MONTHLY')).toBeNull();
    expect(parseRecurrenceRule('RRULE:FREQ=DAILY;COUNT=3')).toBeNull();
  });
});

describe('expandEvent', () => {
  it('returns a one-off event only when it is in range', () => {
    const single = event(at(3, 9), at(3, 10));
    expect(startDays(expandEvent(single, at(2), at(9)))).toEqual([3]);
    expect(expandEvent(single, at(4), at(9))).toEqual([]);
  });

  it('expands a daily event', () => {
    const item = event(at(2, 9), at(2, 10), RECURRENCE_RULES.daily);
    expect(startDays(expandEvent(item, at(2), at(6)))).toEqual([2, 3, 4, 5]);
  });

  it('expands a weekly event on the same weekday', () => {
    const item = event(at(3, 9), at(3, 10), RECURRENCE_RULES.weekly);
    expect(startDays(expandEvent(item, at(1), at(25)))).toEqual([3, 10, 17, 24]);
  });

  it('expands a weekdays event, skipping the weekend', () => {
    const item = event(at(5, 9), at(5, 10), RECURRENCE_RULES.weekdays);
    expect(startDays(expandEvent(item, at(1), at(11)))).toEqual([5, 6, 9, 10]);
  });

  it('keeps the first occurrence of a weekdays event that starts on a weekend', () => {
    const item = event(at(7, 9), at(7, 10), RECURRENCE_RULES.weekdays);
    expect(startDays(expandEvent(item, at(1), at(10)))).toEqual([7, 9]);
  });

  it('never produces occurrences before the event starts', () => {
    const item = event(at(10, 9), at(10, 10), RECURRENCE_RULES.daily);
    expect(startDays(expandEvent(item, at(1), at(12)))).toEqual([10, 11]);
  });

  it('treats the range as including its start and excluding its end', () => {
    const item = event(at(2), at(3), RECURRENCE_RULES.daily);
    expect(startDays(expandEvent(item, at(3), at(5)))).toEqual([3, 4]);
  });

  it('includes an occurrence that began before the range and runs into it', () => {
    const overnight = event(at(2, 22), at(3, 2), RECURRENCE_RULES.daily);
    expect(startDays(expandEvent(overnight, at(10), at(11)))).toEqual([9, 10]);
  });

  it('includes a zero-length task at the very start of the range', () => {
    const task = event(at(5), at(5));
    expect(startDays(expandEvent(task, at(5), at(6)))).toEqual([5]);
    expect(expandEvent(task, at(4), at(5))).toEqual([]);
  });

  it('finds occurrences of an event that started years ago', () => {
    const item = event(new Date(2016, 0, 4, 9), new Date(2016, 0, 4, 10), RECURRENCE_RULES.weekly);
    expect(startDays(expandEvent(item, at(2), at(9)))).toEqual([2]);
  });

  it('keeps the weekly weekday when the range starts mid-cycle', () => {
    const item = event(at(2, 9), at(2, 10), RECURRENCE_RULES.weekly);
    expect(startDays(expandEvent(item, at(12), at(24)))).toEqual([16, 23]);
  });

  it('keeps clock times across a daylight saving change', () => {
    const item = event(at(6, 9, 30), at(6, 10, 45), RECURRENCE_RULES.daily);
    const occurrences = expandEvent(item, at(6), at(11));
    expect(occurrences).toHaveLength(5);
    for (const { start, end } of occurrences) {
      expect([start.getHours(), start.getMinutes()]).toEqual([9, 30]);
      expect([end.getHours(), end.getMinutes()]).toEqual([10, 45]);
    }
  });

  it('keeps an all-day event on day boundaries across a daylight saving change', () => {
    const item = event(at(6), at(7), RECURRENCE_RULES.daily);
    for (const { start, end } of expandEvent(item, at(6), at(11))) {
      expect([start.getHours(), end.getHours()]).toEqual([0, 0]);
      expect(end.getDate()).toBe(start.getDate() + 1);
    }
  });

  it('shows an unsupported rule as a single event instead of dropping it', () => {
    const item = event(at(3, 9), at(3, 10), 'RRULE:FREQ=MONTHLY');
    expect(startDays(expandEvent(item, at(1), at(31)))).toEqual([3]);
  });

  it('returns the original event on each occurrence', () => {
    const item = event(at(3, 9), at(3, 10));
    expect(expandEvent(item, at(1), at(9))[0].event).toBe(item);
  });

  it('returns nothing for invalid dates or an empty range', () => {
    const item = event(at(3, 9), at(3, 10), RECURRENCE_RULES.daily);
    expect(expandEvent({ ...item, startAt: 'nonsense' }, at(1), at(9))).toEqual([]);
    expect(expandEvent(item, at(1), new Date(Number.NaN))).toEqual([]);
    expect(expandEvent(item, at(9), at(1))).toEqual([]);
  });
});
