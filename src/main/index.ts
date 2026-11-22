import path from 'node:path';
import { app, BrowserWindow, nativeTheme, net, powerMonitor, safeStorage, shell } from 'electron';
import { MainEvents } from '../shared/ipc';
import { openDatabase } from './db';
import { getAppSettings } from './db/repositories/settings';
import { loadGoogleConfig } from './google/config';
import { GoogleAuth } from './google/googleAuth';
import { PushQueue } from './google/pushQueue';
import { createTokenStore } from './google/tokenStore';
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
  // Created below; GoogleAuth tells it about connection changes from the start.
  let sync: PushQueue | null = null;
  const google = new GoogleAuth({
    // Development: the project folder's .env. Packaged builds are sorted out in Phase 8.
    config: loadGoogleConfig(path.join(app.getAppPath(), '.env')),
    // Encrypted with safeStorage, next to the database but never inside it.
    store: createTokenStore(path.join(app.getPath('userData'), 'google-account.bin'), safeStorage),
    openExternal: (url) => shell.openExternal(url),
    onStatus: (status) => {
      mainWindow?.webContents.send(MainEvents.googleStatus, status);
      sync?.connectionChanged();
    },
  });

  sync = new PushQueue({
    db,
    transport: google,
    connection: () => (google.isConnected() ? 'on' : google.hasAccount() ? 'needs-reconnect' : 'off'),
    isOnline: () => net.isOnline(),
    onStatus: (status) => mainWindow?.webContents.send(MainEvents.syncStatus, status),
  });
  const queue = sync;

  registerIpcHandlers(db, google, queue, {
    devSeed: !app.isPackaged,
    googleTest: !app.isPackaged,
    testReminder: app.isPackaged
      ? undefined
      : () => showNotification('Test reminder', '6:00 pm · not done yet today', showToday),
  });

  createWindow();
  startReminderScheduler(db, showToday);
  // Finds out early if Google has dropped the sign-in; Settings then shows "Reconnect".
  // Then pushes anything still waiting from last time, and every 2 minutes after.
  void google.verifyStoredSignIn().finally(() => queue.start());
  // Timers don't run while the computer sleeps, and the network is often back on waking.
  powerMonitor.on('resume', () => void queue.run());

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
