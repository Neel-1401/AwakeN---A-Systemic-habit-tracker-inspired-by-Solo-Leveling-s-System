import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { runMigrations } from '../../migrate';
import { getAppSettings, setSetting, updateAppSettings } from '../settings';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db, path.resolve(__dirname, '../../../../../migrations'));
  return db;
}

describe('settings repository', () => {
  it('starts with system theme and Monday weeks', () => {
    expect(getAppSettings(createTestDb())).toEqual({ theme: 'system', weekStartsOn: 1 });
  });

  it('changes only the fields given and persists them', () => {
    const db = createTestDb();
    expect(updateAppSettings(db, { theme: 'dark' })).toEqual({ theme: 'dark', weekStartsOn: 1 });
    expect(updateAppSettings(db, { weekStartsOn: 0 })).toEqual({ theme: 'dark', weekStartsOn: 0 });
    expect(getAppSettings(db)).toEqual({ theme: 'dark', weekStartsOn: 0 });
  });

  it('falls back to defaults for unrecognised stored values', () => {
    const db = createTestDb();
    setSetting(db, 'theme', 'purple');
    setSetting(db, 'weekStartsOn', '3');
    expect(getAppSettings(db)).toEqual({ theme: 'system', weekStartsOn: 1 });
  });
});
