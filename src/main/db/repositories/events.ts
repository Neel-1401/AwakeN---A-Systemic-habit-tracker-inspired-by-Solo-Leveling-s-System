import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { addDays } from 'date-fns';
import { occurrencesInRange, occursOn } from '../../../core/calendar';
import { parseDay, toDay } from '../../../core/dates';
import { parseRecurrenceRule, RECURRENCE_RULES, repeatChoice } from '../../../core/recurrence';
import type { CalendarEvent } from '../../../core/types';
import type { EventInput, EventOccurrenceDto } from '../../../shared/ipc';

export interface EventRow {
  id: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  allDay: number;
  kind: CalendarEvent['kind'];
  completedAt: string | null;
  reminderMinutes: string;
  recurrenceRule: string | null;
  googleEventId: string | null;
  googleEtag: string | null;
  syncState: CalendarEvent['syncState'];
  syncError: string | null;
  changeSeq: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

function parseMinutes(json: string): number[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter((m): m is number => Number.isInteger(m)) : [];
  } catch {
    return [];
  }
}

/** changeSeq is sync bookkeeping (see eventSync.ts), so it stays out of CalendarEvent. */
export function rowToEvent({ changeSeq: _changeSeq, ...row }: EventRow): CalendarEvent {
  return { ...row, allDay: row.allDay === 1, reminderMinutes: parseMinutes(row.reminderMinutes) };
}

/**
 * The sync state a local change leaves behind. 'pending' (the push queue sends it) when syncing
 * is on, or when the event is already in Google, so an edit made while disconnected still goes
 * up after reconnecting. Otherwise it stays 'local' and never leaves this computer.
 */
function stateAfterChange(syncEnabled: boolean, googleEventId: string | null | undefined): CalendarEvent['syncState'] {
  return syncEnabled || googleEventId ? 'pending' : 'local';
}

/** recurrenceRule is decided by the caller, since 'custom' depends on what's stored. */
function inputToColumns(input: EventInput, recurrenceRule: string | null) {
  return {
    title: input.title,
    description: input.description,
    startAt: input.startAt,
    endAt: input.endAt,
    allDay: input.allDay ? 1 : 0,
    kind: input.kind,
    reminderMinutes: JSON.stringify(input.reminderMinutes),
    recurrenceRule,
  };
}

/** An event that exists and isn't deleted. */
export function getEvent(db: Database.Database, id: string): CalendarEvent {
  const row = db.prepare('SELECT * FROM events WHERE id = ? AND deletedAt IS NULL').get(id) as
    | EventRow
    | undefined;
  if (!row) throw new Error('Event not found');
  return rowToEvent(row);
}

/** syncEnabled: Google is connected, so the new event is queued for upload ('pending'). */
export function createEvent(
  db: Database.Database,
  input: EventInput,
  now = new Date(),
  syncEnabled = false
): CalendarEvent {
  if (input.repeat === 'custom') throw new Error('A new event can’t keep a custom repeat');
  const recurrenceRule = input.repeat ? RECURRENCE_RULES[input.repeat] : null;
  const id = randomUUID();
  const timestamp = now.toISOString();
  db.prepare(
    `INSERT INTO events
       (id, title, description, startAt, endAt, allDay, kind, completedAt, reminderMinutes,
        recurrenceRule, googleEventId, googleEtag, syncState, createdAt, updatedAt, deletedAt)
     VALUES
       (@id, @title, @description, @startAt, @endAt, @allDay, @kind, NULL, @reminderMinutes,
        @recurrenceRule, NULL, NULL, @syncState, @timestamp, @timestamp, NULL)`
  ).run({ id, ...inputToColumns(input, recurrenceRule), syncState: stateAfterChange(syncEnabled, null), timestamp });
  return getEvent(db, id);
}

/**
 * Repeating events: changes the whole series. repeat 'custom' keeps the stored rule as it is;
 * null removes it.
 */
export function updateEvent(
  db: Database.Database,
  id: string,
  input: EventInput,
  now = new Date(),
  syncEnabled = false
): CalendarEvent {
  const existing = getEvent(db, id);
  let recurrenceRule: string | null;
  if (input.repeat === 'custom') {
    if (repeatChoice(existing.recurrenceRule) !== 'custom') {
      throw new Error('This event has no custom repeat to keep');
    }
    recurrenceRule = existing.recurrenceRule ?? null;
  } else {
    recurrenceRule = input.repeat ? RECURRENCE_RULES[input.repeat] : null;
  }
  db.prepare(
    `UPDATE events
     SET title = @title, description = @description, startAt = @startAt, endAt = @endAt,
         allDay = @allDay, kind = @kind, reminderMinutes = @reminderMinutes,
         recurrenceRule = @recurrenceRule, updatedAt = @timestamp,
         syncState = @syncState, syncError = NULL, changeSeq = changeSeq + 1
     WHERE id = @id`
  ).run({
    id,
    ...inputToColumns(input, recurrenceRule),
    syncState: stateAfterChange(syncEnabled, existing.googleEventId),
    timestamp: now.toISOString(),
  });
  return getEvent(db, id);
}

/**
 * Soft delete. Repeating events: the whole series. Completions stay in the table but are hidden.
 * The row is kept either way; when it's 'pending', the push queue deletes it in Google and then
 * marks it 'synced' (still deleted here).
 */
export function deleteEvent(db: Database.Database, id: string, now = new Date(), syncEnabled = false): void {
  const existing = getEvent(db, id);
  const timestamp = now.toISOString();
  db.prepare(
    `UPDATE events SET deletedAt = ?, updatedAt = ?, syncState = ?, syncError = NULL, changeSeq = changeSeq + 1
     WHERE id = ?`
  ).run(timestamp, timestamp, stateAfterChange(syncEnabled, existing.googleEventId), id);
}

/**
 * Every occurrence overlapping the local days fromDay..toDay (inclusive), with repeats expanded,
 * ordered by start (all-day first on the same day).
 *
 * SQL narrows the candidates loosely (a day of slack either side covers any time zone, since
 * timed events are stored in UTC and all-day ones as day keys); the exact check is done by
 * occurrencesInRange in local time.
 */
export function listEventsInRange(db: Database.Database, fromDay: string, toDayKey: string): EventOccurrenceDto[] {
  const lower = toDay(addDays(parseDay(fromDay), -1));
  const upper = toDay(addDays(parseDay(toDayKey), 2));
  const events = (
    db
      .prepare(
        `SELECT * FROM events
         WHERE deletedAt IS NULL
           AND (recurrenceRule IS NOT NULL OR (startAt < @upper AND endAt >= @lower))`
      )
      .all({ lower, upper }) as EventRow[]
  ).map(rowToEvent);

  const repeatingTaskIds = events
    .filter((event) => event.kind === 'task' && parseRecurrenceRule(event.recurrenceRule))
    .map((event) => event.id);
  const doneOccurrences = new Set(
    repeatingTaskIds.length === 0
      ? []
      : (
          db
            .prepare(
              `SELECT eventId, day FROM event_completions
               WHERE deletedAt IS NULL AND day BETWEEN ? AND ?
                 AND eventId IN (${repeatingTaskIds.map(() => '?').join(', ')})`
            )
            .all(fromDay, toDayKey, ...repeatingTaskIds) as { eventId: string; day: string }[]
        ).map((row) => `${row.eventId}|${row.day}`)
  );

  return events
    .flatMap((event) =>
      occurrencesInRange(event, fromDay, toDayKey).map((occurrence) => ({ occurrence, event }))
    )
    .sort(
      (a, b) =>
        a.occurrence.start.getTime() - b.occurrence.start.getTime() ||
        Number(b.event.allDay) - Number(a.event.allDay) ||
        a.event.title.localeCompare(b.event.title)
    )
    .map(({ occurrence, event }) => ({
      event,
      day: occurrence.day,
      startAt: occurrence.startAt,
      endAt: occurrence.endAt,
      done:
        event.kind === 'task' &&
        (parseRecurrenceRule(event.recurrenceRule)
          ? doneOccurrences.has(`${event.id}|${occurrence.day}`)
          : event.completedAt !== null),
    }));
}

/**
 * Marks a task done, or undone if it already is. Returns whether it's done afterwards.
 * One-off tasks use events.completedAt. Repeating tasks need the occurrence day and keep one
 * row per day in event_completions (undo soft-deletes it; redo brings the same row back).
 */
export function toggleTaskDone(
  db: Database.Database,
  id: string,
  occurrenceDay?: string,
  now = new Date()
): boolean {
  const timestamp = now.toISOString();
  return db.transaction(() => {
    const event = getEvent(db, id);
    if (event.kind !== 'task') throw new Error('Only tasks can be marked done');

    if (!parseRecurrenceRule(event.recurrenceRule)) {
      const done = event.completedAt === null;
      db.prepare('UPDATE events SET completedAt = ?, updatedAt = ? WHERE id = ?').run(
        done ? timestamp : null,
        timestamp,
        id
      );
      return done;
    }

    if (!occurrenceDay) throw new Error('A repeating task needs the day of the occurrence');
    if (!occursOn(event, occurrenceDay)) throw new Error('This task does not repeat on that day');

    const existing = db
      .prepare('SELECT id, deletedAt FROM event_completions WHERE eventId = ? AND day = ?')
      .get(id, occurrenceDay) as { id: string; deletedAt: string | null } | undefined;
    if (!existing) {
      db.prepare(
        `INSERT INTO event_completions (id, eventId, day, completedAt, createdAt, updatedAt, deletedAt)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`
      ).run(randomUUID(), id, occurrenceDay, timestamp, timestamp, timestamp);
      return true;
    }
    if (existing.deletedAt === null) {
      db.prepare('UPDATE event_completions SET deletedAt = ?, updatedAt = ? WHERE id = ?').run(
        timestamp,
        timestamp,
        existing.id
      );
      return false;
    }
    db.prepare(
      'UPDATE event_completions SET deletedAt = NULL, completedAt = ?, updatedAt = ? WHERE id = ?'
    ).run(timestamp, timestamp, existing.id);
    return true;
  })();
}
