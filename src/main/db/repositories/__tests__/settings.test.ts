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
  it('starts with system theme, Monday weeks and the Today view', () => {
    expect(getAppSettings(createTestDb())).toEqual({ theme: 'system', weekStartsOn: 1, habitsView: 'today' });
  });

  it('changes only the fields given and persists them', () => {
    const db = createTestDb();
    expect(updateAppSettings(db, { theme: 'dark' })).toMatchObject({ theme: 'dark', weekStartsOn: 1 });
    expect(updateAppSettings(db, { weekStartsOn: 0 })).toMatchObject({ theme: 'dark', weekStartsOn: 0 });
    expect(updateAppSettings(db, { habitsView: 'year' })).toEqual({ theme: 'dark', weekStartsOn: 0, habitsView: 'year' });
    expect(getAppSettings(db)).toEqual({ theme: 'dark', weekStartsOn: 0, habitsView: 'year' });
  });

  it('falls back to defaults for unrecognised stored values', () => {
    const db = createTestDb();
    setSetting(db, 'theme', 'purple');
    setSetting(db, 'weekStartsOn', '3');
    setSetting(db, 'habitsView', 'week');
    expect(getAppSettings(db)).toEqual({ theme: 'system', weekStartsOn: 1, habitsView: 'today' });
  });
});
