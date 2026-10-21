import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Habit } from '../../../core/types';
import type { HabitsCreateRequest } from '../../../shared/ipc';

interface HabitRow {
  id: string;
  name: string;
  frequency: Habit['frequency'];
  weekdays: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

function rowToHabit(row: HabitRow): Habit {
  return {
    id: row.id,
    name: row.name,
    frequency: row.frequency,
    weekdays: row.weekdays ? JSON.parse(row.weekdays) : undefined,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export function createHabit(db: Database.Database, input: HabitsCreateRequest): Habit {
  const now = new Date().toISOString();
  const habit: Habit = {
    id: randomUUID(),
    name: input.name,
    frequency: input.frequency,
    weekdays: input.weekdays,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  db.prepare(
    `INSERT INTO habits (id, name, frequency, weekdays, archivedAt, createdAt, updatedAt, deletedAt)
     VALUES (@id, @name, @frequency, @weekdays, @archivedAt, @createdAt, @updatedAt, @deletedAt)`
  ).run({
    id: habit.id,
    name: habit.name,
    frequency: habit.frequency,
    weekdays: habit.weekdays ? JSON.stringify(habit.weekdays) : null,
    archivedAt: habit.archivedAt,
    createdAt: habit.createdAt,
    updatedAt: habit.updatedAt,
    deletedAt: habit.deletedAt,
  });

  return habit;
}

export function listHabits(db: Database.Database): Habit[] {
  const rows = db
    .prepare('SELECT * FROM habits WHERE deletedAt IS NULL ORDER BY createdAt ASC')
    .all() as HabitRow[];
  return rows.map(rowToHabit);
}
