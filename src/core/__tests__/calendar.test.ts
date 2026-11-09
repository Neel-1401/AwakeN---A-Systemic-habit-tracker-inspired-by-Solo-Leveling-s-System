import { describe, expect, it } from 'vitest';
import { layoutDay, occurrencesInRange, occursOn, type CalendarItem } from '../calendar';
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
