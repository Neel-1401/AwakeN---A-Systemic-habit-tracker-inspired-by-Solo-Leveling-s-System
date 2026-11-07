import path from 'node:path';
import { app, BrowserWindow, nativeTheme } from 'electron';
import { openDatabase } from './db';
import { getAppSettings } from './db/repositories/settings';
import { registerIpcHandlers } from './ipc';

function resolveMigrationsDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'migrations')
    : path.join(app.getAppPath(), 'migrations');
}

function createWindow(): void {
  const window = new BrowserWindow({
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

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    window.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  const dbPath = path.join(app.getPath('userData'), 'awaken.db');
  const db = openDatabase(dbPath, resolveMigrationsDir());

  // Apply the saved theme before the window opens.
  nativeTheme.themeSource = getAppSettings(db).theme;
  registerIpcHandlers(db);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
