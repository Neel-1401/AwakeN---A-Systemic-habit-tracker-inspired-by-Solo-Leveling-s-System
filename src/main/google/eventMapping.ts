import type { CalendarEvent } from '../../core/types';

/**
 * The time zone timed events are sent with. Google needs one for repeating events (to expand
 * them across daylight saving changes); India has none, so this is simply where I live.
 */
export const GOOGLE_TIME_ZONE = 'Asia/Kolkata';

/** Google allows at most 5 reminder overrides per event. */
export const MAX_GOOGLE_REMINDERS = 5;
const MAX_REMINDER_MINUTES = 40320;

/** Our own small slice of the Calendar API's Event resource: only what we send. */
export interface GoogleEventTime {
  date?: string | null;
  dateTime?: string | null;
  timeZone?: string | null;
}

export interface GoogleEventBody {
  /** Only on insert: we choose the ID, so a retried insert can't make a duplicate. */
  id?: string;
  summary: string;
  description?: string | null;
  start: GoogleEventTime;
  end: GoogleEventTime;
  recurrence?: string[] | null;
  reminders: { useDefault: false; overrides: { method: 'popup'; minutes: number }[] };
  extendedProperties?: { private: Record<string, string | null> };
}

/** What we read back from Google: just enough to remember the event and its version. */
export interface GoogleEventResource {
  id: string;
  etag: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
}

export type MappableEvent = Pick<
  CalendarEvent,
  'id' | 'title' | 'description' | 'startAt' | 'endAt' | 'allDay' | 'kind' | 'reminderMinutes' | 'recurrenceRule'
>;

/**
 * The Google event ID for a local event. Google accepts IDs we choose if they use only 0-9 and
 * a-v (base32hex) and are 5–1024 long; a UUID without dashes is lowercase hex, so it fits.
 */
export function googleIdFor(localId: string): string {
  return localId.replace(/-/g, '').toLowerCase();
}

/** Timed: UTC ISO plus the time zone. All-day: day keys, end exclusive (as we store them). */
function eventTime(value: string, allDay: boolean, timeZone: string): GoogleEventTime {
  return allDay ? { date: value } : { dateTime: new Date(value).toISOString(), timeZone };
}

/** The stored rule, one Google recurrence line per line of text. Custom rules go as they are. */
export function toRecurrence(rule: string | null | undefined): string[] | null {
  const lines = (rule ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines : null;
}

/** Each reminder as a popup, nearest first, at most 5. Never Google's default reminders. */
export function toReminders(minutes: number[]): GoogleEventBody['reminders'] {
  const valid = [...new Set(minutes)]
    .filter((m) => Number.isInteger(m) && m >= 0 && m <= MAX_REMINDER_MINUTES)
    .sort((a, b) => a - b)
    .slice(0, MAX_GOOGLE_REMINDERS);
  return { useDefault: false, overrides: valid.map((m) => ({ method: 'popup', minutes: m })) };
}

/** The body for events.insert. Tasks are normal Google events tagged awakenKind = 'task'. */
export function toGoogleInsert(event: MappableEvent, timeZone = GOOGLE_TIME_ZONE): GoogleEventBody {
  const body: GoogleEventBody = {
    id: googleIdFor(event.id),
    summary: event.title,
    start: eventTime(event.startAt, event.allDay, timeZone),
    end: eventTime(event.endAt, event.allDay, timeZone),
    reminders: toReminders(event.reminderMinutes),
  };
  if (event.description) body.description = event.description;
  const recurrence = toRecurrence(event.recurrenceRule);
  if (recurrence) body.recurrence = recurrence;
  if (event.kind === 'task') body.extendedProperties = { private: { awakenKind: 'task' } };
  return body;
}

/**
 * The body for events.patch. A patch only changes the fields it names and merges nested objects,
 * so anything we no longer have is sent as null, which tells Google to remove it: the other kind
 * of start/end (all-day ↔ timed), the description, the repeat, the task tag. Fields we don't
 * manage (location, colour, attendees set in Google) are left alone.
 */
export function toGooglePatch(event: MappableEvent, timeZone = GOOGLE_TIME_ZONE): GoogleEventBody {
  const time = (value: string): GoogleEventTime =>
    event.allDay
      ? { date: value, dateTime: null, timeZone: null }
      : { date: null, dateTime: new Date(value).toISOString(), timeZone };
  return {
    summary: event.title,
    description: event.description || null,
    start: time(event.startAt),
    end: time(event.endAt),
    recurrence: toRecurrence(event.recurrenceRule),
    reminders: toReminders(event.reminderMinutes),
    extendedProperties: { private: { awakenKind: event.kind === 'task' ? 'task' : null } },
  };
}
