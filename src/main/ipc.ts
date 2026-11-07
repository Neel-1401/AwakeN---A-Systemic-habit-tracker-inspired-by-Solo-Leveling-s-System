import type Database from 'better-sqlite3';
import { ipcMain } from 'electron';
import type { IpcChannel, IpcContract } from '../shared/ipc';
import { getLogs, toggleLog } from './db/repositories/habitLogs';
import {
  archiveHabit,
  createHabit,
  deleteHabit,
  listHabits,
  restoreHabit,
  updateHabit,
} from './db/repositories/habits';
import { parseDayKey, parseDayRange, parseHabitInput, parseId } from './validation';

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

export function registerIpcHandlers(db: Database.Database): void {
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
}
