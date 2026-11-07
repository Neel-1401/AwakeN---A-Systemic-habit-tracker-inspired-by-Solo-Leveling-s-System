import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import type { HabitInput } from '../../../../shared/ipc';
import { runMigrations } from '../../migrate';
import { getLogs, toggleLog } from '../habitLogs';
import {
  archiveHabit,
  createHabit,
  deleteHabit,
  getHabit,
  listHabits,
  restoreHabit,
  updateHabit,
} from '../habits';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../migrations');

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, MIGRATIONS_DIR);
  return db;
}

const water: HabitInput = {
  name: 'Drink water',
  color: '#4F7A6B',
  frequency: 'daily',
  reminderTime: null,
};

// Local noon, so the local day is the 5th whatever the machine's time zone.
const MAR_5 = new Date(2026, 2, 5, 12, 0);
const MAR_6 = new Date(2026, 2, 6, 12, 0);

let db: Database.Database;
beforeEach(() => {
  db = createTestDb();
});

describe('habits repository', () => {
  it('creates a habit and reads it back', () => {
    const created = createHabit(db, water, MAR_5);

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(created).toMatchObject({
      name: 'Drink water',
      color: '#4F7A6B',
      frequency: 'daily',
      reminderTime: null,
      startDate: '2026-03-05',
      archivedAt: null,
      deletedAt: null,
    });
    expect(created.createdAt).toBe(created.updatedAt);
    expect(listHabits(db)).toEqual([created]);
  });

  it('stores weekdays only for chosen-day habits', () => {
    const gym = createHabit(db, { ...water, frequency: 'weekdays', weekdays: [1, 3, 5] });
    expect(gym.weekdays).toEqual([1, 3, 5]);

    const daily = updateHabit(db, gym.id, { ...water, frequency: 'daily', weekdays: [1] });
    expect(daily.weekdays).toBeUndefined();
  });

  it('updates the editable fields and keeps the start day', () => {
    const habit = createHabit(db, water, MAR_5);
    const updated = updateHabit(
      db,
      habit.id,
      { name: 'Read', color: '#5B6F8C', frequency: 'weekly', reminderTime: '21:30' },
      MAR_6
    );

    expect(updated).toMatchObject({
      name: 'Read',
      color: '#5B6F8C',
      frequency: 'weekly',
      reminderTime: '21:30',
      startDate: '2026-03-05',
      createdAt: habit.createdAt,
      updatedAt: MAR_6.toISOString(),
    });
  });

  it('archives and restores a habit, keeping its logs', () => {
    const habit = createHabit(db, water, MAR_5);
    toggleLog(db, habit.id, '2026-03-05', MAR_5);

    const archived = archiveHabit(db, habit.id, MAR_6);
    expect(archived.archivedAt).toBe(MAR_6.toISOString());
    expect(listHabits(db)).toHaveLength(1);
    expect(getLogs(db, '2026-03-01', '2026-03-31')).toHaveLength(1);

    expect(restoreHabit(db, habit.id).archivedAt).toBeNull();
    expect(getLogs(db, '2026-03-01', '2026-03-31')).toHaveLength(1);
  });

  it('soft delete hides the habit and its logs but keeps the rows', () => {
    const habit = createHabit(db, water, MAR_5);
    toggleLog(db, habit.id, '2026-03-05', MAR_5);

    deleteHabit(db, habit.id, MAR_6);

    expect(listHabits(db)).toEqual([]);
    expect(getLogs(db, '2026-03-01', '2026-03-31')).toEqual([]);
    expect(() => getHabit(db, habit.id)).toThrow('Habit not found');
    expect(() => updateHabit(db, habit.id, water)).toThrow('Habit not found');
    expect(() => toggleLog(db, habit.id, '2026-03-05', MAR_6)).toThrow('Habit not found');

    const row = db.prepare('SELECT deletedAt FROM habits WHERE id = ?').get(habit.id);
    expect(row).toEqual({ deletedAt: MAR_6.toISOString() });
    expect(db.prepare('SELECT COUNT(*) AS n FROM habit_logs').get()).toEqual({ n: 1 });
  });
});

describe('habit logs', () => {
  it('toggling twice leaves the day undone, using a single row', () => {
    const habit = createHabit(db, water, MAR_5);

    const done = toggleLog(db, habit.id, '2026-03-05', MAR_5);
    expect(done.deletedAt).toBeNull();
    expect(getLogs(db, '2026-03-05', '2026-03-05')).toHaveLength(1);

    const undone = toggleLog(db, habit.id, '2026-03-05', MAR_6);
    expect(undone.id).toBe(done.id);
    expect(undone.deletedAt).toBe(MAR_6.toISOString());
    expect(getLogs(db, '2026-03-05', '2026-03-05')).toEqual([]);

    const redone = toggleLog(db, habit.id, '2026-03-05', MAR_6);
    expect(redone.id).toBe(done.id);
    expect(redone.deletedAt).toBeNull();
    expect(db.prepare('SELECT COUNT(*) AS n FROM habit_logs').get()).toEqual({ n: 1 });
  });

  it('allows backfilling past days but not future ones', () => {
    const habit = createHabit(db, water, MAR_5);
    expect(toggleLog(db, habit.id, '2026-02-20', MAR_5).date).toBe('2026-02-20');
    expect(() => toggleLog(db, habit.id, '2026-03-06', MAR_5)).toThrow('future');
  });

  it('returns logs within the range only, inclusive', () => {
    const habit = createHabit(db, water, MAR_6);
    for (const day of ['2026-02-28', '2026-03-01', '2026-03-04', '2026-03-05']) {
      toggleLog(db, habit.id, day, MAR_6);
    }
    expect(getLogs(db, '2026-03-01', '2026-03-04').map((log) => log.date)).toEqual([
      '2026-03-01',
      '2026-03-04',
    ]);
  });

  it('rejects a second row for the same habit and day', () => {
    const habit = createHabit(db, water, MAR_5);
    toggleLog(db, habit.id, '2026-03-05', MAR_5);
    const insert = () =>
      db
        .prepare(
          `INSERT INTO habit_logs (id, habitId, date, completedAt, createdAt, updatedAt)
           VALUES ('x', ?, '2026-03-05', '', '', '')`
        )
        .run(habit.id);
    expect(insert).toThrow(/UNIQUE/);
  });
});

describe('migration 0002', () => {
  it('fills in colour and start day for habits created before it', () => {
    const old = new Database(':memory:');
    old.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, '0001_init.sql'), 'utf-8'));
    old.exec(`CREATE TABLE _migrations (id TEXT PRIMARY KEY, appliedAt TEXT NOT NULL)`);
    old.prepare(`INSERT INTO _migrations VALUES ('0001_init.sql', '')`).run();
    const createdAt = MAR_5.toISOString();
    old
      .prepare(
        `INSERT INTO habits (id, name, frequency, createdAt, updatedAt)
         VALUES ('00000000-0000-4000-8000-000000000000', 'Old', 'daily', ?, ?)`
      )
      .run(createdAt, createdAt);

    runMigrations(old, MIGRATIONS_DIR);

    expect(listHabits(old)[0]).toMatchObject({
      name: 'Old',
      color: '#4F7A6B',
      reminderTime: null,
      startDate: '2026-03-05',
    });
  });
});
