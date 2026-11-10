import { addDays, addMinutes, format, isValid, parseISO } from 'date-fns';
import { parseDay, toDay } from './dates';
import { repeatChoice, type RepeatChoice } from './recurrence';
import type { CalendarEvent } from './types';

/**
 * The event dialog's fields, as plain strings the date/time inputs use. Everything is local time.
 * For all-day items endDay is the LAST day (inclusive), which is what people expect to type;
 * storage uses an exclusive end, so formToEvent adds a day.
 */
export interface EventForm {
  title: string;
  description: string;
  kind: CalendarEvent['kind'];
  allDay: boolean;
  /** 'YYYY-MM-DD' */
  startDay: string;
  /** 'HH:mm' */
  startTime: string;
  endDay: string;
  endTime: string;
  repeat: RepeatChoice | null;
  reminderMinutes: number[];
}

/** Same shape as EventInput in shared/ipc.ts (core doesn't import from outside itself). */
export interface EventFormOutput {
  title: string;
  description: string | null;
  kind: CalendarEvent['kind'];
  allDay: boolean;
  startAt: string;
  endAt: string;
  repeat: RepeatChoice | null;
  reminderMinutes: number[];
}

/** Tasks are dated to-dos, not blocks of time. They're stored with this length so end > start. */
export const TASK_MINUTES = 30;
export const DEFAULT_EVENT_MINUTES = 60;
export const DEFAULT_REMINDERS = [10];

const toTime = (date: Date) => format(date, 'HH:mm');

/** A new item starting at `start`, e.g. where a time slot was clicked. */
export function newEventForm(start: Date, kind: CalendarEvent['kind'] = 'event'): EventForm {
  const end = addMinutes(start, kind === 'task' ? TASK_MINUTES : DEFAULT_EVENT_MINUTES);
  return {
    title: '',
    description: '',
    kind,
    allDay: false,
    startDay: toDay(start),
    startTime: toTime(start),
    endDay: toDay(end),
    endTime: toTime(end),
    repeat: null,
    reminderMinutes: [...DEFAULT_REMINDERS],
  };
}

/** A new all-day item on `day`, e.g. from a click in the all-day row. */
export function newAllDayForm(day: string): EventForm {
  return {
    ...newEventForm(parseDay(day)),
    allDay: true,
    startTime: '09:00',
    endTime: '10:00',
    endDay: day,
  };
}

/** Fills the dialog from a stored event (the whole series, for a repeating one). */
export function eventToForm(event: CalendarEvent): EventForm {
  const base = {
    title: event.title,
    description: event.description ?? '',
    kind: event.kind,
    repeat: repeatChoice(event.recurrenceRule),
    reminderMinutes: [...event.reminderMinutes],
  };
  if (event.allDay) {
    return {
      ...base,
      allDay: true,
      startDay: event.startAt,
      // Stored end is exclusive; the form shows the last day.
      endDay: toDay(addDays(parseDay(event.endAt), -1)),
      // Kept so switching all-day off offers a sensible time.
      startTime: '09:00',
      endTime: '10:00',
    };
  }
  const start = parseISO(event.startAt);
  const end = parseISO(event.endAt);
  return {
    ...base,
    allDay: false,
    startDay: toDay(start),
    startTime: toTime(start),
    endDay: toDay(end),
    endTime: toTime(end),
  };
}

function localDateTime(day: string, time: string): Date | null {
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  const date = parseISO(`${day}T${time}`);
  return isValid(date) ? date : null;
}

function validDay(day: string): boolean {
  try {
    parseDay(day);
    return true;
  } catch {
    return false;
  }
}

/**
 * Turns the dialog's fields into what main stores, or a message to show next to Save.
 * Main validates again; this just gives quicker, friendlier messages.
 * Tasks have no end field: a timed task lasts TASK_MINUTES, an all-day task one day.
 */
export function formToEvent(form: EventForm): { ok: true; value: EventFormOutput } | { ok: false; error: string } {
  const title = form.title.trim();
  if (!title) return { ok: false, error: 'Give it a title.' };
  if (!validDay(form.startDay)) return { ok: false, error: 'Choose a start date.' };

  const isTask = form.kind === 'task';
  let startAt: string;
  let endAt: string;

  if (form.allDay) {
    const lastDay = isTask ? form.startDay : form.endDay;
    if (!validDay(lastDay)) return { ok: false, error: 'Choose an end date.' };
    if (lastDay < form.startDay) return { ok: false, error: 'The end date is before the start date.' };
    startAt = form.startDay;
    endAt = toDay(addDays(parseDay(lastDay), 1));
  } else {
    const start = localDateTime(form.startDay, form.startTime);
    if (!start) return { ok: false, error: 'Choose a start time.' };
    let end: Date | null;
    if (isTask) {
      end = addMinutes(start, TASK_MINUTES);
    } else {
      if (!validDay(form.endDay)) return { ok: false, error: 'Choose an end date.' };
      end = localDateTime(form.endDay, form.endTime);
      if (!end) return { ok: false, error: 'Choose an end time.' };
      if (end <= start) return { ok: false, error: 'The end is before the start.' };
    }
    startAt = start.toISOString();
    endAt = end.toISOString();
  }

  return {
    ok: true,
    value: {
      title,
      description: form.description.trim() || null,
      kind: form.kind,
      allDay: form.allDay,
      startAt,
      endAt,
      repeat: form.repeat,
      reminderMinutes: [...new Set(form.reminderMinutes)].sort((a, b) => a - b),
    },
  };
}

/** 0 → "At the start", 10 → "10 min before", 60 → "1 hour before", 1440 → "1 day before". */
export function describeReminder(minutes: number): string {
  if (minutes === 0) return 'At the start';
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} before`;
  if (minutes % 10080 === 0) return plural(minutes / 10080, 'week');
  if (minutes % 1440 === 0) return plural(minutes / 1440, 'day');
  if (minutes % 60 === 0) return plural(minutes / 60, 'hour');
  return `${minutes} min before`;
}
