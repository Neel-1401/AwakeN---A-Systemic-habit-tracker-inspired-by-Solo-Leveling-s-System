import { format, isValid, parseISO } from 'date-fns';

export type WeekStartsOn = 0 | 1;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Parses a YYYY-MM-DD string as local midnight. Throws on anything else. */
export function parseDay(day: string): Date {
  const parsed = parseISO(day);
  if (!DAY_PATTERN.test(day) || !isValid(parsed)) {
    throw new RangeError(`Invalid day: ${day}`);
  }
  return parsed;
}

export function toDay(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}
