import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { runMigrations } from '../../migrate';
import { createHabit, listHabits } from '../habits';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, path.resolve(__dirname, '../../../../../migrations'));
  return db;
}

describe('habits repository', () => {
  it('writes a habit and reads it back', () => {
    const db = createTestDb();

    const created = createHabit(db, { name: 'Drink water', frequency: 'daily' });

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(created.name).toBe('Drink water');
    expect(created.frequency).toBe('daily');
    expect(created.createdAt).toBe(created.updatedAt);
    expect(created.deletedAt).toBeNull();

    const habits = listHabits(db);
    expect(habits).toHaveLength(1);
    expect(habits[0]).toEqual(created);
  });
});
