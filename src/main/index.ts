import path from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import { openDatabase } from './db';
import { createHabit, listHabits } from './db/repositories/habits';
import { IpcChannels } from '../shared/ipc';

function resolveMigrationsDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'migrations')
    : path.join(app.getAppPath(), 'migrations');
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1000,
    height: 700,
    title: 'AwakeN',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    window.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  const dbPath = path.join(app.getPath('userData'), 'awaken.db');
  const db = openDatabase(dbPath, resolveMigrationsDir());

  ipcMain.handle(IpcChannels.habitsCreate, (_event, input) => createHabit(db, input));
  ipcMain.handle(IpcChannels.habitsList, () => listHabits(db));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
