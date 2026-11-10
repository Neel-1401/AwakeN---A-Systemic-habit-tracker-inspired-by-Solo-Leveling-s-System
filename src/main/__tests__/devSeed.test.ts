import path from 'node:path';
import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedSampleData } from '../devSeed';
import { runMigrations } from '../db/migrate';
import { listEventsInRange } from '../db/repositories/events';
import { getLogs } from '../db/repositories/habitLogs';
import { createHabit, listHabits } from '../db/repositories/habits';

// Tuesday 10 November 2026, local time.
const NOW = new Date(2026, 10, 10, 8, 0);

let db: Database.Database;
beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, path.resolve(__dirname, '../../../migrations'));
});

describe('seedSampleData', () => {
  it('adds habits with past ticks and a week of calendar items', () => {
    expect(seedSampleData(db, NOW)).toEqual({ habits: 4, events: 8 });

    const habits = listHabits(db);
    expect(habits.map((h) => h.name)).toContain('Gym');
    expect(habits.every((h) => h.startDate === '2026-07-13')).toBe(true);

    const logs = getLogs(db, '2026-07-13', '2026-11-10');
    expect(logs.length).toBeGreaterThan(100);
    expect(logs.every((log) => log.date < '2026-11-10')).toBe(true);

    const thisWeek = listEventsInRange(db, '2026-11-09', '2026-11-15');
    const titles = new Set(thisWeek.map((o) => o.event.title));
    expect(titles).toEqual(
      new Set(['Algorithms lecture', 'Study group', 'Dentist', 'Lab session', 'Trip home', 'Submit lab report', 'Pay phone bill', 'Water plants']),
    );
    // The weekday lecture repeats Monday to Friday.
    expect(thisWeek.filter((o) => o.event.title === 'Algorithms lecture').map((o) => o.day)).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
    ]);
    expect(thisWeek.find((o) => o.event.title === 'Pay phone bill')?.done).toBe(true);
  });

  it('gives the same history every time', () => {
    seedSampleData(db, NOW);
    const first = getLogs(db, '2026-07-01', '2026-11-10').length;
    const other = new Database(':memory:');
    runMigrations(other, path.resolve(__dirname, '../../../migrations'));
    seedSampleData(other, NOW);
    expect(getLogs(other, '2026-07-01', '2026-11-10')).toHaveLength(first);
  });

  it('refuses to touch a database that already has data, and leaves it unchanged', () => {
    createHabit(db, { name: 'Real habit', color: '#4F7A6B', frequency: 'daily', reminderTime: null }, NOW);
    expect(() => seedSampleData(db, NOW)).toThrow('empty database');
    expect(listHabits(db).map((h) => h.name)).toEqual(['Real habit']);
    expect(listEventsInRange(db, '2026-11-01', '2026-11-30')).toEqual([]);
  });
});
