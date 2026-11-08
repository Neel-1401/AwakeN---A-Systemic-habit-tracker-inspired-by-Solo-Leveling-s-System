import type Database from 'better-sqlite3';
import type { AppSettings } from '../../../shared/ipc';

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  weekStartsOn: 1,
  habitsView: 'today',
  habitNotifications: true,
};

const KEYS = {
  theme: 'theme',
  weekStartsOn: 'weekStartsOn',
  habitsView: 'habitsView',
  habitNotifications: 'habitNotifications',
} as const;

export function getSetting(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(db: Database.Database, key: string, value: string, now = new Date()): void {
  db.prepare(
    `INSERT INTO settings (key, value, updatedAt) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`
  ).run(key, value, now.toISOString());
}

/** Stored values that are missing or unrecognised fall back to the defaults. */
export function getAppSettings(db: Database.Database): AppSettings {
  const theme = getSetting(db, KEYS.theme);
  const weekStartsOn = getSetting(db, KEYS.weekStartsOn);
  const habitsView = getSetting(db, KEYS.habitsView);
  const habitNotifications = getSetting(db, KEYS.habitNotifications);
  return {
    theme: theme === 'light' || theme === 'dark' || theme === 'system' ? theme : DEFAULT_SETTINGS.theme,
    weekStartsOn: weekStartsOn === '0' ? 0 : weekStartsOn === '1' ? 1 : DEFAULT_SETTINGS.weekStartsOn,
    habitsView:
      habitsView === 'today' || habitsView === 'month' || habitsView === 'year'
        ? habitsView
        : DEFAULT_SETTINGS.habitsView,
    habitNotifications:
      habitNotifications === '0' ? false : habitNotifications === '1' ? true : DEFAULT_SETTINGS.habitNotifications,
  };
}

export function updateAppSettings(
  db: Database.Database,
  changes: Partial<AppSettings>,
  now = new Date()
): AppSettings {
  db.transaction(() => {
    if (changes.theme !== undefined) setSetting(db, KEYS.theme, changes.theme, now);
    if (changes.weekStartsOn !== undefined) {
      setSetting(db, KEYS.weekStartsOn, String(changes.weekStartsOn), now);
    }
    if (changes.habitsView !== undefined) setSetting(db, KEYS.habitsView, changes.habitsView, now);
    if (changes.habitNotifications !== undefined) {
      setSetting(db, KEYS.habitNotifications, changes.habitNotifications ? '1' : '0', now);
    }
  })();
  return getAppSettings(db);
}
