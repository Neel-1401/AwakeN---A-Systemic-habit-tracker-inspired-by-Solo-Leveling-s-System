import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { toDay } from '../../../core/dates';
import type { HabitLog } from '../../../core/types';
import { getHabit } from './habits';

function getLogRow(db: Database.Database, habitId: string, day: string): HabitLog | undefined {
  return db.prepare('SELECT * FROM habit_logs WHERE habitId = ? AND date = ?').get(habitId, day) as
    | HabitLog
    | undefined;
}

/**
 * Completes the habit on that day, or undoes it if it's already complete. There is one row per
 * habit per day: undo soft-deletes it and completing again brings the same row back.
 * Days in the future are refused; past days can be backfilled.
 */
export function toggleLog(
  db: Database.Database,
  habitId: string,
  day: string,
  now = new Date()
): HabitLog {
  if (day > toDay(now)) throw new Error("Can't complete a habit on a future day");
  const timestamp = now.toISOString();

  // A transaction makes the read and the write one step, so two quick clicks can't both insert.
  const toggle = db.transaction(() => {
    getHabit(db, habitId);
    const existing = getLogRow(db, habitId, day);

    if (!existing) {
      db.prepare(
        `INSERT INTO habit_logs (id, habitId, date, completedAt, createdAt, updatedAt, deletedAt)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`
      ).run(randomUUID(), habitId, day, timestamp, timestamp, timestamp);
    } else if (existing.deletedAt === null) {
      db.prepare('UPDATE habit_logs SET deletedAt = ?, updatedAt = ? WHERE id = ?').run(
        timestamp,
        timestamp,
        existing.id
      );
    } else {
      db.prepare(
        'UPDATE habit_logs SET deletedAt = NULL, completedAt = ?, updatedAt = ? WHERE id = ?'
      ).run(timestamp, timestamp, existing.id);
    }
    return getLogRow(db, habitId, day)!;
  });
  return toggle();
}

/** Live completions between two days (inclusive) for habits that aren't deleted. */
export function getLogs(db: Database.Database, fromDayKey: string, toDayKey: string): HabitLog[] {
  return db
    .prepare(
      `SELECT habit_logs.* FROM habit_logs
       JOIN habits ON habits.id = habit_logs.habitId
       WHERE habit_logs.deletedAt IS NULL
         AND habits.deletedAt IS NULL
         AND habit_logs.date BETWEEN ? AND ?
       ORDER BY habit_logs.date ASC, habit_logs.habitId ASC`
    )
    .all(fromDayKey, toDayKey) as HabitLog[];
}
