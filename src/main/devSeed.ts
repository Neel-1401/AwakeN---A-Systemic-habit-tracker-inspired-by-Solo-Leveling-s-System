import type Database from 'better-sqlite3';
import { addDays, getDay, startOfDay, startOfWeek } from 'date-fns';
import { toDay } from '../core/dates';
import type { EventInput, HabitInput } from '../shared/ipc';
import { createEvent, toggleTaskDone } from './db/repositories/events';
import { toggleLog } from './db/repositories/habitLogs';
import { createHabit } from './db/repositories/habits';

/** How far back the sample habits start, so Month and Year have history to show. */
const HISTORY_DAYS = 120;

const SAMPLE_HABITS: (HabitInput & { chance: number })[] = [
  { name: 'Code for an hour', color: '#4F7A6B', frequency: 'daily', reminderTime: '21:00', chance: 0.8 },
  { name: 'Gym', color: '#A0674B', frequency: 'weekdays', weekdays: [1, 3, 5], reminderTime: '18:00', chance: 0.75 },
  { name: 'Read 20 pages', color: '#5B6F8C', frequency: 'daily', reminderTime: null, chance: 0.6 },
  { name: 'Edit one video', color: '#7D5A7A', frequency: 'weekly', reminderTime: null, chance: 0.7 },
];

/** A small seeded random generator, so the sample history looks the same every time. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

function countLive(db: Database.Database, table: 'habits' | 'events'): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE deletedAt IS NULL`).get() as { n: number }).n;
}

/**
 * Development only: fills an EMPTY database with sample habits (with ~4 months of ticks) and a
 * week of calendar items around `now`. It refuses if any habit or event exists, so it can never
 * mix made-up data into real data. Everything goes in one transaction: all or nothing.
 */
export function seedSampleData(db: Database.Database, now = new Date()): { habits: number; events: number } {
  if (countLive(db, 'habits') > 0 || countLive(db, 'events') > 0) {
    throw new Error('Sample data only goes into an empty database. Delete your habits and events first.');
  }

  const seed = db.transaction(() => {
    const random = seededRandom(7);
    const today = startOfDay(now);
    const started = addDays(today, -HISTORY_DAYS);

    for (const { chance, ...input } of SAMPLE_HABITS) {
      const habit = createHabit(db, input, started);
      for (let offset = HISTORY_DAYS; offset >= 1; offset--) {
        const day = addDays(today, -offset);
        const weekday = getDay(day);
        // Weekly habits get at most one tick a week, on a Wednesday.
        const scheduled =
          input.frequency === 'daily' ||
          (input.frequency === 'weekdays' && input.weekdays!.includes(weekday)) ||
          (input.frequency === 'weekly' && weekday === 3);
        if (scheduled && random() < chance) toggleLog(db, habit.id, toDay(day), now);
      }
    }

    const at = (dayOffset: number, hour: number, minute = 0) => {
      const date = addDays(today, dayOffset);
      date.setHours(hour, minute);
      return date.toISOString();
    };
    const day = (offset: number) => toDay(addDays(today, offset));
    // Offsets from today to this week's Monday and Saturday, so the lecture fills the week.
    const monday = Math.round((startOfWeek(today, { weekStartsOn: 1 }).getTime() - today.getTime()) / 86_400_000);
    const base: Omit<EventInput, 'title' | 'startAt' | 'endAt'> = {
      description: null,
      kind: 'event',
      allDay: false,
      repeat: null,
      reminderMinutes: [10],
    };

    const events: EventInput[] = [
      { ...base, title: 'Algorithms lecture', startAt: at(monday, 9), endAt: at(monday, 10, 30), repeat: 'weekdays' },
      { ...base, title: 'Study group', startAt: at(1, 16), endAt: at(1, 17, 30), description: 'Library, room 2' },
      { ...base, title: 'Dentist', startAt: at(3, 11), endAt: at(3, 11, 45), reminderMinutes: [60, 1440] },
      { ...base, title: 'Lab session', startAt: at(1, 10), endAt: at(1, 12) },
      { ...base, title: 'Trip home', allDay: true, startAt: day(monday + 5), endAt: day(monday + 7), reminderMinutes: [] },
      { ...base, kind: 'task', title: 'Submit lab report', startAt: at(0, 17), endAt: at(0, 17, 30) },
      { ...base, kind: 'task', title: 'Pay phone bill', startAt: at(-1, 12), endAt: at(-1, 12, 30) },
      { ...base, kind: 'task', title: 'Water plants', allDay: true, startAt: day(0), endAt: day(1), repeat: 'daily', reminderMinutes: [] },
    ];
    for (const input of events) {
      const created = createEvent(db, input, now);
      if (input.title === 'Pay phone bill') toggleTaskDone(db, created.id, undefined, now);
    }
    return { habits: SAMPLE_HABITS.length, events: events.length };
  });
  return seed();
}
