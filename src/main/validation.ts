import { parseDay } from '../core/dates';
import { isHabitColor } from '../core/palette';
import type { Habit } from '../core/types';
import type { AppSettings, EventInput, HabitInput } from '../shared/ipc';

/**
 * Anything arriving over IPC comes from the renderer, so main treats it as untrusted and checks
 * it here before it reaches the database. Each parser returns a clean value or throws.
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

const FREQUENCIES: readonly Habit['frequency'][] = ['daily', 'weekdays', 'weekly'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
export const MAX_HABIT_NAME_LENGTH = 80;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseId(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new ValidationError('Invalid id');
  }
  return value;
}

export function parseDayKey(value: unknown): string {
  if (typeof value !== 'string') throw new ValidationError('Day must be YYYY-MM-DD');
  try {
    parseDay(value);
  } catch {
    throw new ValidationError(`Invalid day: ${value}`);
  }
  return value;
}

export function parseDayRange(from: unknown, to: unknown): [string, string] {
  const fromDay = parseDayKey(from);
  const toDay = parseDayKey(to);
  if (fromDay > toDay) throw new ValidationError('Start day is after end day');
  return [fromDay, toDay];
}

export function parseReminderTime(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !TIME_PATTERN.test(value)) {
    throw new ValidationError('Reminder time must be HH:mm');
  }
  return value;
}

function parseWeekdays(value: unknown): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError('Choose at least one day');
  }
  if (!value.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)) {
    throw new ValidationError('Weekdays must be whole numbers from 0 (Sunday) to 6 (Saturday)');
  }
  return [...new Set(value as number[])].sort((a, b) => a - b);
}

export const MAX_EVENT_TITLE_LENGTH = 200;
export const MAX_EVENT_DESCRIPTION_LENGTH = 8000;
/** Google allows at most 5 popup reminders, each up to 4 weeks (40320 minutes) before. */
export const MAX_REMINDERS = 5;
export const MAX_REMINDER_MINUTES = 40320;
const MAX_EVENT_DAYS = 366;
const MAX_RANGE_DAYS = 400;
const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A calendar range of local days, at most about a year long. */
export function parseEventRange(from: unknown, to: unknown): [string, string] {
  const [fromDay, toDay] = parseDayRange(from, to);
  const span = (Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / DAY_MS;
  if (span > MAX_RANGE_DAYS) throw new ValidationError('Date range is too long');
  return [fromDay, toDay];
}

function parseDateTime(value: unknown, label: string): string {
  if (typeof value !== 'string' || !DATE_TIME_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    throw new ValidationError(`${label} must be a date and time`);
  }
  // Normalise to UTC, e.g. "2026-11-09T09:00+05:30" → "2026-11-09T03:30:00.000Z".
  return new Date(value).toISOString();
}

function parseReminderMinutes(value: unknown): number[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ValidationError('Reminders must be a list of minutes');
  if (!value.every((m) => Number.isInteger(m) && m >= 0 && m <= MAX_REMINDER_MINUTES)) {
    throw new ValidationError('Each reminder must be between 0 minutes and 4 weeks before');
  }
  const unique = [...new Set(value as number[])].sort((a, b) => a - b);
  if (unique.length > MAX_REMINDERS) throw new ValidationError(`At most ${MAX_REMINDERS} reminders`);
  return unique;
}

export function parseEventInput(value: unknown): EventInput {
  if (!isRecord(value)) throw new ValidationError('Event details are missing');

  const title = typeof value.title === 'string' ? value.title.trim() : '';
  if (!title) throw new ValidationError('Title is required');
  if (title.length > MAX_EVENT_TITLE_LENGTH) {
    throw new ValidationError(`Title must be ${MAX_EVENT_TITLE_LENGTH} characters or fewer`);
  }

  let description: string | null = null;
  if (value.description !== undefined && value.description !== null) {
    if (typeof value.description !== 'string') throw new ValidationError('Description must be text');
    description = value.description.trim() || null;
    if (description && description.length > MAX_EVENT_DESCRIPTION_LENGTH) {
      throw new ValidationError('Description is too long');
    }
  }

  if (value.kind !== 'event' && value.kind !== 'task') throw new ValidationError('Kind must be event or task');
  if (typeof value.allDay !== 'boolean') throw new ValidationError('All-day must be on or off');

  const startAt = value.allDay ? parseDayKey(value.startAt) : parseDateTime(value.startAt, 'Start');
  const endAt = value.allDay ? parseDayKey(value.endAt) : parseDateTime(value.endAt, 'End');
  if (endAt <= startAt) throw new ValidationError('End must be after start');
  const span = (Date.parse(value.allDay ? `${endAt}T00:00:00Z` : endAt) -
    Date.parse(value.allDay ? `${startAt}T00:00:00Z` : startAt)) / DAY_MS;
  if (span > MAX_EVENT_DAYS) throw new ValidationError('An event can last at most a year');

  const repeat = value.repeat ?? null;
  if (repeat !== null && repeat !== 'daily' && repeat !== 'weekly' && repeat !== 'weekdays') {
    throw new ValidationError('Repeat must be none, daily, weekly or weekdays');
  }

  return {
    title,
    description,
    kind: value.kind,
    allDay: value.allDay,
    startAt,
    endAt,
    repeat,
    reminderMinutes: parseReminderMinutes(value.reminderMinutes),
  };
}

export function parseSettingsChanges(value: unknown): Partial<AppSettings> {
  if (!isRecord(value)) throw new ValidationError('Settings changes are missing');
  const changes: Partial<AppSettings> = {};
  if (value.theme !== undefined) {
    if (value.theme !== 'system' && value.theme !== 'light' && value.theme !== 'dark') {
      throw new ValidationError('Theme must be system, light or dark');
    }
    changes.theme = value.theme;
  }
  if (value.weekStartsOn !== undefined) {
    if (value.weekStartsOn !== 0 && value.weekStartsOn !== 1) {
      throw new ValidationError('Week must start on Sunday (0) or Monday (1)');
    }
    changes.weekStartsOn = value.weekStartsOn;
  }
  if (value.habitsView !== undefined) {
    if (value.habitsView !== 'today' && value.habitsView !== 'month' && value.habitsView !== 'year') {
      throw new ValidationError('Habits view must be today, month or year');
    }
    changes.habitsView = value.habitsView;
  }
  if (value.habitNotifications !== undefined) {
    if (typeof value.habitNotifications !== 'boolean') {
      throw new ValidationError('Habit notifications must be on or off');
    }
    changes.habitNotifications = value.habitNotifications;
  }
  return changes;
}

export function parseHabitInput(value: unknown): HabitInput {
  if (!isRecord(value)) throw new ValidationError('Habit details are missing');

  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (!name) throw new ValidationError('Name is required');
  if (name.length > MAX_HABIT_NAME_LENGTH) {
    throw new ValidationError(`Name must be ${MAX_HABIT_NAME_LENGTH} characters or fewer`);
  }

  if (!isHabitColor(value.color)) throw new ValidationError('Unknown colour');

  const frequency = value.frequency as Habit['frequency'];
  if (!FREQUENCIES.includes(frequency)) throw new ValidationError('Unknown repeat option');

  return {
    name,
    color: value.color,
    frequency,
    // Weekdays only mean something for 'weekdays'; drop them otherwise so stale chips don't stick.
    weekdays: frequency === 'weekdays' ? parseWeekdays(value.weekdays) : undefined,
    reminderTime: parseReminderTime(value.reminderTime),
  };
}
