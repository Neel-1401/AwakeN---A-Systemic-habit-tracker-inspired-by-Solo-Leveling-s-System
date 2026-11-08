import path from 'node:path';
import { app, BrowserWindow, nativeTheme } from 'electron';
import { MainEvents } from '../shared/ipc';
import { openDatabase } from './db';
import { getAppSettings } from './db/repositories/settings';
import { registerIpcHandlers } from './ipc';
import { showNotification, startReminderScheduler } from './reminderScheduler';

// Windows groups and names notifications by this ID. Without it, toasts can be missing or show
// "electron.app.Electron". Phase 8's installer must use the same ID (electron-builder appId).
if (process.platform === 'win32') app.setAppUserModelId('com.neel.awaken');

let mainWindow: BrowserWindow | null = null;

function resolveMigrationsDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'migrations')
    : path.join(app.getAppPath(), 'migrations');
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 720,
    minHeight: 480,
    title: 'AwakeN',
    // Matches --bg, so the window doesn't flash white before the page paints.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#111111' : '#FAFAFA',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

/** Brings the window to the front on the Today tab (used when a reminder is clicked). */
function showToday(): void {
  if (!mainWindow) createWindow();
  const window = mainWindow!;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  window.webContents.send(MainEvents.showToday);
}

app.whenReady().then(() => {
  const dbPath = path.join(app.getPath('userData'), 'awaken.db');
  const db = openDatabase(dbPath, resolveMigrationsDir());

  // Apply the saved theme before the window opens.
  nativeTheme.themeSource = getAppSettings(db).theme;
  registerIpcHandlers(db, {
    testReminder: app.isPackaged
      ? undefined
      : () => showNotification('Test reminder', '6:00 pm · not done yet today', showToday),
  });

  createWindow();
  startReminderScheduler(db, showToday);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
