import { describe, expect, it } from 'vitest';
import {
  describeReminder,
  eventToForm,
  formToEvent,
  newAllDayForm,
  newEventForm,
  TASK_MINUTES,
  type EventForm,
} from '../eventForm';
import { RECURRENCE_RULES } from '../recurrence';
import type { CalendarEvent } from '../types';

// Local times, so these pass in any time zone. 9 November 2026 is a Monday.
const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m);

function stored(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: 'e1',
    title: 'Lecture',
    description: null,
    startAt: at(9, 9).toISOString(),
    endAt: at(9, 10, 30).toISOString(),
    allDay: false,
    kind: 'event',
    completedAt: null,
    reminderMinutes: [10],
    recurrenceRule: null,
    googleEventId: null,
    googleEtag: null,
    syncState: 'local',
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
    ...overrides,
  };
}

function expectOk(form: EventForm) {
  const result = formToEvent(form);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe('newEventForm', () => {
  it('starts where the slot was clicked and lasts an hour, with a 10 minute reminder', () => {
    expect(newEventForm(at(9, 14, 30))).toMatchObject({
      startDay: '2026-11-09',
      startTime: '14:30',
      endDay: '2026-11-09',
      endTime: '15:30',
      allDay: false,
      repeat: null,
      reminderMinutes: [10],
    });
  });

  it('rolls the end over midnight', () => {
    expect(newEventForm(at(9, 23, 30))).toMatchObject({ endDay: '2026-11-10', endTime: '00:30' });
  });

  it('makes a one-day all-day item', () => {
    expect(newAllDayForm('2026-11-09')).toMatchObject({ allDay: true, startDay: '2026-11-09', endDay: '2026-11-09' });
  });
});

describe('formToEvent', () => {
  it('stores timed events as UTC instants of the local times', () => {
    const value = expectOk({ ...newEventForm(at(9, 9)), title: '  Lecture  ', description: '  ' });
    expect(value).toMatchObject({
      title: 'Lecture',
      description: null,
      startAt: at(9, 9).toISOString(),
      endAt: at(9, 10).toISOString(),
    });
  });

  it('stores all-day items with an exclusive end day', () => {
    const value = expectOk({ ...newAllDayForm('2026-11-09'), title: 'Trip', endDay: '2026-11-11' });
    expect(value).toMatchObject({ allDay: true, startAt: '2026-11-09', endAt: '2026-11-12' });
  });

  it('gives tasks a fixed length and ignores the end fields', () => {
    const form = { ...newEventForm(at(9, 17), 'task'), title: 'Submit lab', endDay: '2020-01-01' };
    const value = expectOk(form);
    expect(Date.parse(value.endAt) - Date.parse(value.startAt)).toBe(TASK_MINUTES * 60_000);
    expect(expectOk({ ...form, allDay: true })).toMatchObject({ startAt: '2026-11-09', endAt: '2026-11-10' });
  });

  it('sorts reminders and drops duplicates', () => {
    expect(expectOk({ ...newEventForm(at(9, 9)), title: 'x', reminderMinutes: [60, 10, 60] }).reminderMinutes).toEqual([10, 60]);
  });

  it('explains what is wrong instead of saving', () => {
    const base = { ...newEventForm(at(9, 9)), title: 'x' };
    expect(formToEvent({ ...base, title: ' ' })).toEqual({ ok: false, error: 'Give it a title.' });
    expect(formToEvent({ ...base, endTime: '08:00' })).toEqual({ ok: false, error: 'The end is before the start.' });
    expect(formToEvent({ ...base, startTime: '' })).toEqual({ ok: false, error: 'Choose a start time.' });
    expect(formToEvent({ ...base, startDay: '' })).toEqual({ ok: false, error: 'Choose a start date.' });
    expect(formToEvent({ ...base, allDay: true, endDay: '2026-11-08' })).toEqual({
      ok: false,
      error: 'The end date is before the start date.',
    });
  });
});

describe('eventToForm', () => {
  it('round-trips a timed event', () => {
    const event = stored({ reminderMinutes: [0, 30], recurrenceRule: RECURRENCE_RULES.weekdays });
    const form = eventToForm(event);
    expect(form).toMatchObject({ startTime: '09:00', endTime: '10:30', repeat: 'weekdays' });
    expect(expectOk(form)).toMatchObject({ startAt: event.startAt, endAt: event.endAt, reminderMinutes: [0, 30] });
  });

  it('shows an all-day event’s last day, and round-trips it', () => {
    const event = stored({ allDay: true, startAt: '2026-11-09', endAt: '2026-11-12' });
    const form = eventToForm(event);
    expect(form.endDay).toBe('2026-11-11');
    expect(expectOk(form)).toMatchObject({ startAt: '2026-11-09', endAt: '2026-11-12' });
  });

  it('keeps a rule the app can’t edit as custom', () => {
    const form = eventToForm(stored({ recurrenceRule: 'RRULE:FREQ=MONTHLY' }));
    expect(form.repeat).toBe('custom');
    expect(expectOk(form).repeat).toBe('custom');
  });
});

describe('describeReminder', () => {
  it('uses the largest whole unit', () => {
    expect([0, 10, 60, 90, 120, 1440, 2880, 10080].map(describeReminder)).toEqual([
      'At the start',
      '10 min before',
      '1 hour before',
      '90 min before',
      '2 hours before',
      '1 day before',
      '2 days before',
      '1 week before',
    ]);
  });
});
