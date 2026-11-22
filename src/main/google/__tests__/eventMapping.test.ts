import { describe, expect, it } from 'vitest';
import { googleIdFor, toGoogleInsert, toGooglePatch, toReminders, type MappableEvent } from '../eventMapping';

const ID = '3f2b8c1e-9a4d-4e7f-8b21-0c6d5e4f3a29';

const lecture: MappableEvent = {
  id: ID,
  title: 'Algorithms lecture',
  description: 'Room 204',
  kind: 'event',
  allDay: false,
  // 9:00–10:00 in India (UTC+5:30).
  startAt: '2026-11-23T03:30:00.000Z',
  endAt: '2026-11-23T04:30:00.000Z',
  recurrenceRule: null,
  reminderMinutes: [10],
};

describe('Google event mapping', () => {
  it('timed event: UTC date-times plus Asia/Kolkata, our own ID, popup reminders', () => {
    expect(toGoogleInsert(lecture)).toEqual({
      id: '3f2b8c1e9a4d4e7f8b210c6d5e4f3a29',
      summary: 'Algorithms lecture',
      description: 'Room 204',
      start: { dateTime: '2026-11-23T03:30:00.000Z', timeZone: 'Asia/Kolkata' },
      end: { dateTime: '2026-11-23T04:30:00.000Z', timeZone: 'Asia/Kolkata' },
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 10 }] },
    });
  });

  it('turns any stored ISO time into UTC', () => {
    const body = toGoogleInsert({ ...lecture, startAt: '2026-11-23T09:00:00+05:30' });
    expect(body.start).toEqual({ dateTime: '2026-11-23T03:30:00.000Z', timeZone: 'Asia/Kolkata' });
  });

  it('the Google ID uses only base32hex characters (0-9, a-v)', () => {
    expect(googleIdFor(ID)).toMatch(/^[0-9a-v]{5,1024}$/);
    expect(googleIdFor(ID.toUpperCase())).toBe(googleIdFor(ID));
  });

  it('all-day event: day keys with the exclusive end exactly as stored', () => {
    const body = toGoogleInsert({ ...lecture, allDay: true, startAt: '2026-11-23', endAt: '2026-11-25' });
    expect(body.start).toEqual({ date: '2026-11-23' });
    expect(body.end).toEqual({ date: '2026-11-25' });
  });

  it('repeat: the stored RRULE as the recurrence', () => {
    const body = toGoogleInsert({ ...lecture, recurrenceRule: 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' });
    expect(body.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR']);
    expect(toGoogleInsert(lecture)).not.toHaveProperty('recurrence');
  });

  it('custom rule from Google goes back unchanged, one line per recurrence entry', () => {
    const custom = 'RRULE:FREQ=MONTHLY;BYDAY=2TU;UNTIL=20270601T000000Z';
    expect(toGoogleInsert({ ...lecture, recurrenceRule: custom }).recurrence).toEqual([custom]);
    expect(
      toGoogleInsert({ ...lecture, recurrenceRule: 'RRULE:FREQ=DAILY\nEXDATE;VALUE=DATE:20261125' }).recurrence,
    ).toEqual(['RRULE:FREQ=DAILY', 'EXDATE;VALUE=DATE:20261125']);
  });

  it('reminders: never the calendar default, nearest first, at most 5', () => {
    expect(toReminders([])).toEqual({ useDefault: false, overrides: [] });
    expect(toReminders([1440, 0, 10, 10, 30, 60, 120]).overrides.map((o) => o.minutes)).toEqual([0, 10, 30, 60, 120]);
    expect(toReminders([30]).overrides).toEqual([{ method: 'popup', minutes: 30 }]);
  });

  it('task: a normal Google event tagged awakenKind = task', () => {
    const body = toGoogleInsert({ ...lecture, kind: 'task', title: 'Lab report', description: null });
    expect(body.extendedProperties).toEqual({ private: { awakenKind: 'task' } });
    expect(body).not.toHaveProperty('description');
    expect(toGoogleInsert(lecture)).not.toHaveProperty('extendedProperties');
  });

  it('patch: no ID, and clears what the event no longer has', () => {
    const patch = toGooglePatch({ ...lecture, description: null });
    expect(patch).not.toHaveProperty('id');
    expect(patch).toMatchObject({
      description: null,
      recurrence: null,
      start: { date: null, dateTime: '2026-11-23T03:30:00.000Z', timeZone: 'Asia/Kolkata' },
      extendedProperties: { private: { awakenKind: null } },
    });
  });

  it('patch: switching to all-day removes the date-time and time zone', () => {
    const patch = toGooglePatch({ ...lecture, allDay: true, startAt: '2026-11-23', endAt: '2026-11-24', kind: 'task' });
    expect(patch.start).toEqual({ date: '2026-11-23', dateTime: null, timeZone: null });
    expect(patch.end).toEqual({ date: '2026-11-24', dateTime: null, timeZone: null });
    expect(patch.extendedProperties).toEqual({ private: { awakenKind: 'task' } });
  });
});
