import { parseDay } from '../core/dates';
import { isHabitColor } from '../core/palette';
import type { Habit } from '../core/types';
import type { AppSettings, HabitInput } from '../shared/ipc';

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
