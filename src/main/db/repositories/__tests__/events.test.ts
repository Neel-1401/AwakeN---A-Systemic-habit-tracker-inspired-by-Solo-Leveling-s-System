import path from 'node:path';
import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import type { EventInput } from '../../../../shared/ipc';
import { runMigrations } from '../../migrate';
import { createEvent, deleteEvent, getEvent, listEventsInRange, toggleTaskDone, updateEvent } from '../events';

// November 2026: the 9th is a Monday. Times are local, so this passes in any time zone.
const iso = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m).toISOString();
const NOW = new Date(2026, 10, 9, 8, 0);

const lecture: EventInput = {
  title: 'Algorithms lecture',
  description: null,
  kind: 'event',
  allDay: false,
  startAt: iso(9, 9),
  endAt: iso(9, 10),
  repeat: null,
  reminderMinutes: [10],
};

let db: Database.Database;
beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, path.resolve(__dirname, '../../../../../migrations'));
});

const titlesOn = (from: string, to = from) => listEventsInRange(db, from, to).map((o) => `${o.day} ${o.event.title}`);

describe('events repository', () => {
  it('creates an event and reads it back as local, unsynced data', () => {
    const created = createEvent(db, lecture, NOW);
    expect(created).toMatchObject({
      title: 'Algorithms lecture',
      allDay: false,
      kind: 'event',
      startAt: iso(9, 9),
      reminderMinutes: [10],
      recurrenceRule: null,
      syncState: 'local',
      googleEventId: null,
      completedAt: null,
      deletedAt: null,
    });
    expect(getEvent(db, created.id)).toEqual(created);
  });

  it('stores the repeat as RRULE text and expands it in a range', () => {
    createEvent(db, { ...lecture, repeat: 'weekdays' }, NOW);
    // Fri 13th → Tue 17th skips the weekend.
    expect(titlesOn('2026-11-13', '2026-11-17')).toEqual([
      '2026-11-13 Algorithms lecture',
      '2026-11-16 Algorithms lecture',
      '2026-11-17 Algorithms lecture',
    ]);
    const [first] = listEventsInRange(db, '2026-11-09', '2026-11-09');
    expect(first.event.recurrenceRule).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
  });

  it('lists all-day events by day key with an exclusive end, before timed ones', () => {
    createEvent(db, lecture, NOW);
    createEvent(db, { ...lecture, title: 'Fest', allDay: true, startAt: '2026-11-09', endAt: '2026-11-11' }, NOW);
    expect(titlesOn('2026-11-09')).toEqual(['2026-11-09 Fest', '2026-11-09 Algorithms lecture']);
    expect(titlesOn('2026-11-10')).toEqual(['2026-11-09 Fest']);
    expect(titlesOn('2026-11-11')).toEqual([]);
  });

  it('updates the whole series and soft-deletes it', () => {
    const event = createEvent(db, { ...lecture, repeat: 'daily' }, NOW);
    updateEvent(db, event.id, { ...lecture, title: 'Lecture (moved)', repeat: 'weekly' }, NOW);
    expect(titlesOn('2026-11-09', '2026-11-16')).toEqual(['2026-11-09 Lecture (moved)', '2026-11-16 Lecture (moved)']);

    deleteEvent(db, event.id, NOW);
    expect(titlesOn('2026-11-09', '2026-11-16')).toEqual([]);
    expect(() => getEvent(db, event.id)).toThrow('Event not found');
    expect(db.prepare('SELECT deletedAt FROM events WHERE id = ?').get(event.id)).toEqual({ deletedAt: NOW.toISOString() });
  });
});

describe('toggleTaskDone', () => {
  const task: EventInput = { ...lecture, title: 'Lab report', kind: 'task', startAt: iso(9, 17), endAt: iso(9, 17, 30) };

  it('toggles a one-off task with completedAt', () => {
    const created = createEvent(db, task, NOW);
    expect(toggleTaskDone(db, created.id, undefined, NOW)).toBe(true);
    expect(listEventsInRange(db, '2026-11-09', '2026-11-09')[0].done).toBe(true);
    expect(toggleTaskDone(db, created.id, undefined, NOW)).toBe(false);
    expect(getEvent(db, created.id).completedAt).toBeNull();
  });

  it('keeps a repeating task’s completion per day, in one row per day', () => {
    const created = createEvent(db, { ...task, repeat: 'daily' }, NOW);
    expect(toggleTaskDone(db, created.id, '2026-11-10', NOW)).toBe(true);
    const doneByDay = Object.fromEntries(listEventsInRange(db, '2026-11-09', '2026-11-11').map((o) => [o.day, o.done]));
    expect(doneByDay).toEqual({ '2026-11-09': false, '2026-11-10': true, '2026-11-11': false });

    expect(toggleTaskDone(db, created.id, '2026-11-10', NOW)).toBe(false);
    expect(toggleTaskDone(db, created.id, '2026-11-10', NOW)).toBe(true);
    expect(db.prepare('SELECT COUNT(*) AS n FROM event_completions').get()).toEqual({ n: 1 });
  });

  it('refuses days the task does not repeat on, a missing day, and plain events', () => {
    const weekly = createEvent(db, { ...task, repeat: 'weekly' }, NOW);
    expect(() => toggleTaskDone(db, weekly.id, '2026-11-10', NOW)).toThrow('does not repeat on that day');
    expect(() => toggleTaskDone(db, weekly.id, undefined, NOW)).toThrow('needs the day');
    const event = createEvent(db, lecture, NOW);
    expect(() => toggleTaskDone(db, event.id, undefined, NOW)).toThrow('Only tasks');
  });
});
