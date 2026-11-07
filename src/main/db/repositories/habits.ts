import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { parseISO } from 'date-fns';
import { toDay } from '../../../core/dates';
import { DEFAULT_HABIT_COLOR, isHabitColor } from '../../../core/palette';
import type { Habit } from '../../../core/types';
import type { HabitInput } from '../../../shared/ipc';

interface HabitRow {
  id: string;
  name: string;
  frequency: Habit['frequency'];
  weekdays: string | null;
  color: string;
  reminderTime: string | null;
  startDate: string | null;
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
    color: isHabitColor(row.color) ? row.color : DEFAULT_HABIT_COLOR,
    reminderTime: row.reminderTime,
    startDate: row.startDate ?? toDay(parseISO(row.createdAt)),
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

/** A habit that exists and isn't deleted. Archived habits are included. */
export function getHabit(db: Database.Database, id: string): Habit {
  const row = db.prepare('SELECT * FROM habits WHERE id = ? AND deletedAt IS NULL').get(id) as
    | HabitRow
    | undefined;
  if (!row) throw new Error('Habit not found');
  return rowToHabit(row);
}

/** All habits that aren't deleted, archived ones included, oldest first. */
export function listHabits(db: Database.Database): Habit[] {
  const rows = db
    .prepare('SELECT * FROM habits WHERE deletedAt IS NULL ORDER BY createdAt ASC, id ASC')
    .all() as HabitRow[];
  return rows.map(rowToHabit);
}

export function createHabit(db: Database.Database, input: HabitInput, now = new Date()): Habit {
  const id = randomUUID();
  const timestamp = now.toISOString();
  db.prepare(
    `INSERT INTO habits
       (id, name, frequency, weekdays, color, reminderTime, startDate,
        archivedAt, createdAt, updatedAt, deletedAt)
     VALUES
       (@id, @name, @frequency, @weekdays, @color, @reminderTime, @startDate,
        NULL, @timestamp, @timestamp, NULL)`
  ).run({
    id,
    ...inputToColumns(input),
    startDate: toDay(now),
    timestamp,
  });
  return getHabit(db, id);
}

export function updateHabit(
  db: Database.Database,
  id: string,
  input: HabitInput,
  now = new Date()
): Habit {
  getHabit(db, id);
  db.prepare(
    `UPDATE habits
     SET name = @name, frequency = @frequency, weekdays = @weekdays, color = @color,
         reminderTime = @reminderTime, updatedAt = @timestamp
     WHERE id = @id`
  ).run({ id, ...inputToColumns(input), timestamp: now.toISOString() });
  return getHabit(db, id);
}

/** Hides the habit from Today. Its logs stay, and it can be restored. */
export function archiveHabit(db: Database.Database, id: string, now = new Date()): Habit {
  const habit = getHabit(db, id);
  if (habit.archivedAt) return habit;
  const timestamp = now.toISOString();
  db.prepare('UPDATE habits SET archivedAt = ?, updatedAt = ? WHERE id = ?').run(
    timestamp,
    timestamp,
    id
  );
  return getHabit(db, id);
}

export function restoreHabit(db: Database.Database, id: string, now = new Date()): Habit {
  getHabit(db, id);
  db.prepare('UPDATE habits SET archivedAt = NULL, updatedAt = ? WHERE id = ?').run(
    now.toISOString(),
    id
  );
  return getHabit(db, id);
}

/** Soft delete. The row and its logs stay in the database but are no longer returned. */
export function deleteHabit(db: Database.Database, id: string, now = new Date()): void {
  getHabit(db, id);
  const timestamp = now.toISOString();
  db.prepare('UPDATE habits SET deletedAt = ?, updatedAt = ? WHERE id = ?').run(
    timestamp,
    timestamp,
    id
  );
}

function inputToColumns(input: HabitInput) {
  return {
    name: input.name,
    frequency: input.frequency,
    weekdays: input.frequency === 'weekdays' && input.weekdays ? JSON.stringify(input.weekdays) : null,
    color: input.color,
    reminderTime: input.reminderTime,
  };
}
