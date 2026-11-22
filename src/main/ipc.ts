import type Database from 'better-sqlite3';
import { ipcMain, nativeTheme } from 'electron';
import type { IpcChannel, IpcContract } from '../shared/ipc';
import {
  createEvent,
  deleteEvent,
  listEventsInRange,
  toggleTaskDone,
  updateEvent,
} from './db/repositories/events';
import { getLogs, toggleLog } from './db/repositories/habitLogs';
import {
  archiveHabit,
  createHabit,
  deleteHabit,
  listHabits,
  restoreHabit,
  updateHabit,
} from './db/repositories/habits';
import { getAppSettings, updateAppSettings } from './db/repositories/settings';
import { seedSampleData } from './devSeed';
import { listFailed } from './db/repositories/eventSync';
import type { GoogleAuth } from './google/googleAuth';
import type { PushQueue } from './google/pushQueue';
import {
  parseBoolean,
  parseDayKey,
  parseDayRange,
  parseEventInput,
  parseEventRange,
  parseHabitInput,
  parseId,
  parseSettingsChanges,
} from './validation';

/**
 * Handlers receive their arguments as `unknown` on purpose: the type of what the renderer
 * *should* send doesn't prove what it *did* send. Each handler validates before using them.
 * The return type is still checked against IpcContract.
 */
type Handler<C extends IpcChannel> = (
  ...args: unknown[]
) => IpcContract[C]['result'] | Promise<IpcContract[C]['result']>;

function handle<C extends IpcChannel>(channel: C, handler: Handler<C>): void {
  ipcMain.handle(channel, (_event, ...args: unknown[]) => handler(...args));
}

interface IpcOptions {
  /** Development only: shows a sample notification for the Settings "Test reminder" button. */
  testReminder?: () => void;
  /** Development only: registers dev:seedSample (left out of packaged builds). */
  devSeed?: boolean;
  /** Development only: registers google:testConnection. */
  googleTest?: boolean;
}

export function registerIpcHandlers(
  db: Database.Database,
  google: GoogleAuth,
  sync: PushQueue,
  options: IpcOptions = {}
): void {
  if (options.testReminder) {
    const testReminder = options.testReminder;
    handle('reminders:test', () => testReminder());
  }
  if (options.devSeed) handle('dev:seedSample', () => seedSampleData(db));
  handle('habits:list', () => listHabits(db));
  handle('habits:create', (input) => createHabit(db, parseHabitInput(input)));
  handle('habits:update', (id, input) => updateHabit(db, parseId(id), parseHabitInput(input)));
  handle('habits:archive', (id) => archiveHabit(db, parseId(id)));
  handle('habits:restore', (id) => restoreHabit(db, parseId(id)));
  handle('habits:delete', (id) => deleteHabit(db, parseId(id)));
  handle('habits:toggleLog', (habitId, dayKey) =>
    toggleLog(db, parseId(habitId), parseDayKey(dayKey))
  );
  handle('habits:getLogs', (from, to) => getLogs(db, ...parseDayRange(from, to)));
  handle('events:listInRange', (from, to) => listEventsInRange(db, ...parseEventRange(from, to)));
  // Each change is saved as 'pending' while a Google account is linked, then pushed soon after.
  handle('events:create', (input) => {
    const event = createEvent(db, parseEventInput(input), new Date(), google.hasAccount());
    sync.kick();
    return event;
  });
  handle('events:update', (id, input) => {
    const event = updateEvent(db, parseId(id), parseEventInput(input), new Date(), google.hasAccount());
    sync.kick();
    return event;
  });
  handle('events:delete', (id) => {
    deleteEvent(db, parseId(id), new Date(), google.hasAccount());
    sync.kick();
  });
  handle('events:toggleTaskDone', (id, day) =>
    toggleTaskDone(db, parseId(id), day === undefined || day === null ? undefined : parseDayKey(day))
  );
  // No arguments to check: the renderer can only ask, and nothing returned contains a token.
  handle('google:getStatus', () => google.getStatus());
  handle('google:connect', async () => {
    // Reconnecting after an expired sign-in keeps syncing as before; a new connection asks first.
    const wasLinked = google.hasAccount();
    const status = await google.connect();
    if (status.state === 'connected' && !wasLinked) sync.offerUpload();
    return status;
  });
  handle('google:cancelConnect', () => google.cancelConnect());
  handle('google:disconnect', () => google.disconnect());
  if (options.googleTest) handle('google:testConnection', () => google.testConnection());
  handle('sync:getStatus', () => sync.getStatus());
  handle('sync:listFailed', () => listFailed(db));
  handle('sync:retry', (id) => sync.retry(parseId(id)));
  handle('sync:answerUpload', (upload) => sync.answerUpload(parseBoolean(upload)));
  handle('sync:uploadLocal', () => sync.uploadLocal());
  handle('settings:get', () => getAppSettings(db));
  handle('settings:update', (changes) => {
    const parsed = parseSettingsChanges(changes);
    const settings = updateAppSettings(db, parsed);
    // themeSource drives the window frame and the renderer's prefers-color-scheme together.
    if (parsed.theme) nativeTheme.themeSource = settings.theme;
    return settings;
  });
}
