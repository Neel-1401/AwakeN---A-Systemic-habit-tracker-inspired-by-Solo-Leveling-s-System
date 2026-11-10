import { describe, expect, it } from 'vitest';
import { groupByDay, layoutDay, monthWeeks, occurrencesInRange, occursOn, type CalendarItem, type ItemSpan } from '../calendar';
import { RECURRENCE_RULES } from '../recurrence';

// November 2026: the 1st is a Sunday, the 6th a Friday, the 9th a Monday.
// Times are built in local time, so the tests pass in any time zone.
const at = (month: number, day: number, h: number, m = 0) => new Date(2026, month - 1, day, h, m);
const iso = (month: number, day: number, h: number, m = 0) => at(month, day, h, m).toISOString();

function timed(start: string, end: string, recurrenceRule: string | null = null): CalendarItem {
  return { startAt: start, endAt: end, allDay: false, recurrenceRule };
}

const days = (occurrences: { day: string }[]) => occurrences.map((o) => o.day);

describe('occurrencesInRange', () => {
  it('returns a timed event once, as UTC strings that are local times', () => {
    const lecture = timed(iso(11, 9, 9), iso(11, 9, 10));
    const [only] = occurrencesInRange(lecture, '2026-11-09', '2026-11-09');
    expect(only.day).toBe('2026-11-09');
    expect(only.startAt).toBe(iso(11, 9, 9));
    expect(only.start.getHours()).toBe(9);
    expect(occurrencesInRange(lecture, '2026-11-10', '2026-11-15')).toEqual([]);
  });

  it('includes an all-day event on each day it spans, with an exclusive end day', () => {
    const trip: CalendarItem = { startAt: '2026-11-09', endAt: '2026-11-12', allDay: true, recurrenceRule: null };
    for (const day of ['2026-11-09', '2026-11-10', '2026-11-11']) {
      expect(occurrencesInRange(trip, day, day)).toHaveLength(1);
    }
    expect(occurrencesInRange(trip, '2026-11-12', '2026-11-12')).toEqual([]);
    expect(occurrencesInRange(trip, '2026-11-08', '2026-11-08')).toEqual([]);
    const [occurrence] = occurrencesInRange(trip, '2026-11-01', '2026-11-30');
    expect(occurrence).toMatchObject({ day: '2026-11-09', startAt: '2026-11-09', endAt: '2026-11-12' });
  });

  it('repeats an all-day event by day keys', () => {
    const deadline: CalendarItem = { startAt: '2026-11-02', endAt: '2026-11-03', allDay: true, recurrenceRule: RECURRENCE_RULES.weekly };
    const result = occurrencesInRange(deadline, '2026-11-01', '2026-11-30');
    expect(result.map((o) => [o.startAt, o.endAt])).toEqual([
      ['2026-11-02', '2026-11-03'],
      ['2026-11-09', '2026-11-10'],
      ['2026-11-16', '2026-11-17'],
      ['2026-11-23', '2026-11-24'],
      ['2026-11-30', '2026-12-01'],
    ]);
  });

  it('skips Saturday and Sunday for a weekdays repeat', () => {
    const standup = timed(iso(11, 6, 9), iso(11, 6, 9, 15), RECURRENCE_RULES.weekdays);
    expect(days(occurrencesInRange(standup, '2026-11-06', '2026-11-10'))).toEqual([
      '2026-11-06',
      '2026-11-09',
      '2026-11-10',
    ]);
  });

  it('keeps a weekly repeat on its weekday across a month end', () => {
    const lab = timed(iso(10, 28, 14), iso(10, 28, 16), RECURRENCE_RULES.weekly);
    expect(days(occurrencesInRange(lab, '2026-10-26', '2026-11-15'))).toEqual([
      '2026-10-28',
      '2026-11-04',
      '2026-11-11',
    ]);
  });

  it('includes an event that crosses midnight on both days, keyed to the day it starts', () => {
    const lateShift = timed(iso(11, 9, 23), iso(11, 10, 1));
    expect(days(occurrencesInRange(lateShift, '2026-11-10', '2026-11-10'))).toEqual(['2026-11-09']);
  });
});

describe('occursOn', () => {
  it('is true only on days an occurrence starts', () => {
    const standup = timed(iso(11, 6, 9), iso(11, 6, 9, 15), RECURRENCE_RULES.weekdays);
    expect(occursOn(standup, '2026-11-09')).toBe(true);
    expect(occursOn(standup, '2026-11-07')).toBe(false);
    expect(occursOn(standup, '2026-11-05')).toBe(false);
  });
});

describe('layoutDay', () => {
  const item = (id: string, start: Date, end: Date) => ({ id, start, end });
  const byId = (laidOut: ReturnType<typeof layoutDay>) => Object.fromEntries(laidOut.map((l) => [l.id, l]));

  it('puts overlapping events side by side and reuses a column once it is free', () => {
    const result = byId(
      layoutDay(
        [
          item('a', at(11, 9, 9), at(11, 9, 10)),
          item('b', at(11, 9, 9, 30), at(11, 9, 11)),
          item('c', at(11, 9, 10), at(11, 9, 11)),
          item('d', at(11, 9, 13), at(11, 9, 14)),
        ],
        '2026-11-09',
      ),
    );
    expect(result.a).toEqual({ id: 'a', top: 540, bottom: 600, column: 0, columns: 2 });
    expect(result.b).toMatchObject({ column: 1, columns: 2 });
    // c starts when a ends, so it takes a's column back.
    expect(result.c).toMatchObject({ column: 0, columns: 2 });
    expect(result.d).toMatchObject({ column: 0, columns: 1 });
  });

  it('gives three events at the same time three columns, longest first', () => {
    const result = layoutDay(
      [item('short', at(11, 9, 9), at(11, 9, 10)), item('long', at(11, 9, 9), at(11, 9, 12)), item('mid', at(11, 9, 9), at(11, 9, 11))],
      '2026-11-09',
    );
    expect(result.map((l) => [l.id, l.column, l.columns])).toEqual([
      ['long', 0, 3],
      ['mid', 1, 3],
      ['short', 2, 3],
    ]);
  });

  it('clips an event that crosses midnight to each day', () => {
    const night = item('night', at(11, 9, 23), at(11, 10, 1));
    expect(layoutDay([night], '2026-11-09')).toEqual([{ id: 'night', top: 1380, bottom: 1440, column: 0, columns: 1 }]);
    expect(layoutDay([night], '2026-11-10')).toEqual([{ id: 'night', top: 0, bottom: 60, column: 0, columns: 1 }]);
    expect(layoutDay([night], '2026-11-11')).toEqual([]);
  });

  it('gives a zero-length task a minimum height', () => {
    const task = item('task', at(11, 9, 17), at(11, 9, 17));
    expect(layoutDay([task], '2026-11-09')).toEqual([{ id: 'task', top: 1020, bottom: 1050, column: 0, columns: 1 }]);
  });
});

describe('monthWeeks', () => {
  it('covers November 2026 in whole Monday-first weeks', () => {
    const weeks = monthWeeks(2026, 11, 1);
    expect(weeks).toHaveLength(6);
    expect(weeks[0][0]).toBe('2026-10-26');
    expect(weeks[0][6]).toBe('2026-11-01');
    expect(weeks[5][6]).toBe('2026-12-06');
    expect(weeks.every((week) => week.length === 7)).toBe(true);
  });

  it('starts on Sunday when asked, and needs only 4 rows for February 2026', () => {
    const weeks = monthWeeks(2026, 2, 0);
    expect(weeks).toHaveLength(4);
    expect(weeks[0][0]).toBe('2026-02-01');
    expect(weeks[3][6]).toBe('2026-02-28');
  });
});

describe('groupByDay', () => {
  const days = ['2026-11-09', '2026-11-10', '2026-11-11'];
  const item = (name: string, span: ItemSpan) => ({ name, span });
  const names = (map: Map<string, { name: string }[]>) =>
    Object.fromEntries([...map].map(([day, list]) => [day, list.map((i) => i.name)]));

  it('places all-day items on each day of their span, before timed ones', () => {
    const items = [
      item('lecture', { allDay: false, startAt: iso(11, 10, 9), endAt: iso(11, 10, 10) }),
      item('trip', { allDay: true, startAt: '2026-11-10', endAt: '2026-11-12' }),
    ];
    expect(names(groupByDay(items, days, (i) => i.span))).toEqual({
      '2026-11-09': [],
      '2026-11-10': ['trip', 'lecture'],
      '2026-11-11': ['trip'],
    });
  });

  it('shows a timed item on every day it touches, but not the day it ends at midnight', () => {
    const items = [
      item('overnight', { allDay: false, startAt: iso(11, 9, 22), endAt: iso(11, 10, 2) }),
      item('until midnight', { allDay: false, startAt: iso(11, 11, 20), endAt: iso(11, 12, 0) }),
      item('task', { allDay: false, startAt: iso(11, 11, 17), endAt: iso(11, 11, 17) }),
    ];
    expect(names(groupByDay(items, [...days, '2026-11-12'], (i) => i.span))).toEqual({
      '2026-11-09': ['overnight'],
      '2026-11-10': ['overnight'],
      '2026-11-11': ['until midnight', 'task'],
      '2026-11-12': [],
    });
  });
});
