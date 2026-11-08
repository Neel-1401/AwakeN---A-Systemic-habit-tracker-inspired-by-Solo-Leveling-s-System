import path from 'node:path';
import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { toggleLog } from '../db/repositories/habitLogs';
import { createHabit, updateHabit } from '../db/repositories/habits';
import { getSetting, setSetting, updateAppSettings } from '../db/repositories/settings';
import { runMigrations } from '../db/migrate';
import { checkReminders, FIRED_KEYS_SETTING, loadFiredKeys } from '../reminderCheck';

// Wednesday 11 March 2026.
const at = (h: number, m: number, day = 11) => new Date(2026, 2, day, h, m, 10);
const gym = { name: 'Gym', color: '#A0674B', frequency: 'daily', reminderTime: '18:00' } as const;

let db: Database.Database;
beforeEach(() => {
  db = new Database(':memory:');
  runMigrations(db, path.resolve(__dirname, '../../../migrations'));
});

describe('checkReminders', () => {
  it('returns a notice once and remembers it in the settings table', () => {
    const habit = createHabit(db, gym, at(9, 0, 2));

    expect(checkReminders(db, at(17, 59))).toEqual([]);
    expect(checkReminders(db, at(18, 0))).toEqual([
      { key: `2026-03-11|${habit.id}|18:00`, habitId: habit.id, title: 'Gym', body: '6:00 pm · not done yet today' },
    ]);
    expect(checkReminders(db, at(18, 0))).toEqual([]);
    expect(loadFiredKeys(db, '2026-03-11')).toEqual([`2026-03-11|${habit.id}|18:00`]);
  });

  it('shows nothing when habit notifications are off, and does not use up the reminder', () => {
    createHabit(db, gym, at(9, 0, 2));
    updateAppSettings(db, { habitNotifications: false });
    expect(checkReminders(db, at(18, 1))).toEqual([]);

    updateAppSettings(db, { habitNotifications: true });
    expect(checkReminders(db, at(18, 2))).toHaveLength(1);
  });

  it('skips a habit already done today', () => {
    const habit = createHabit(db, gym, at(9, 0, 2));
    toggleLog(db, habit.id, '2026-03-11', at(12, 0));
    expect(checkReminders(db, at(18, 1))).toEqual([]);
  });

  it('fires again after the time is edited', () => {
    const habit = createHabit(db, gym, at(9, 0, 2));
    expect(checkReminders(db, at(18, 0))).toHaveLength(1);
    updateHabit(db, habit.id, { ...gym, reminderTime: '18:30' });
    expect(checkReminders(db, at(18, 30))).toHaveLength(1);
  });

  it('keeps only today’s keys, dropping earlier days', () => {
    const habit = createHabit(db, gym, at(9, 0, 2));
    setSetting(db, FIRED_KEYS_SETTING, JSON.stringify([`2026-03-10|${habit.id}|18:00`]));
    checkReminders(db, at(18, 0));
    expect(JSON.parse(getSetting(db, FIRED_KEYS_SETTING)!)).toEqual([`2026-03-11|${habit.id}|18:00`]);
  });

  it('copes with a corrupted fired-keys setting', () => {
    createHabit(db, gym, at(9, 0, 2));
    setSetting(db, FIRED_KEYS_SETTING, 'not json');
    expect(checkReminders(db, at(18, 0))).toHaveLength(1);
  });
});
