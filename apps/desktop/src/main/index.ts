import { app, BrowserWindow, ipcMain, session } from 'electron';
import { join } from 'node:path';
import { serveAppProtocol, registerAppScheme } from './app-protocol';
import { createHandlers } from './handlers';
import { registerIpcHandlers } from './ipc-router';
import {
  APP_ORIGIN,
  hardenAllWebContents,
  hardenSession,
  isAppUrl,
  secureWebPreferences,
} from './security';

const devServerUrl = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL'];

registerAppScheme();
hardenAllWebContents(devServerUrl);

// Only one Postloom may run at a time: two instances sending from the same
// database could send the same email twice.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function platform(): 'win32' | 'darwin' | 'linux' {
  const current = process.platform;
  return current === 'win32' || current === 'darwin' ? current : 'linux';
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    title: 'Postloom',
    autoHideMenuBar: true,
    webPreferences: secureWebPreferences(join(import.meta.dirname, '../preload/index.cjs')),
  });

  window.once('ready-to-show', () => window.show());

  if (devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadURL(`${APP_ORIGIN}/index.html`);
  }
  return window;
}

app.on('second-instance', () => {
  const [window] = BrowserWindow.getAllWindows();
  if (window) {
    if (window.isMinimized()) window.restore();
    window.focus();
  }
});

void app.whenReady().then(() => {
  hardenSession(session.defaultSession);
  serveAppProtocol(join(import.meta.dirname, '../renderer'));

  registerIpcHandlers(
    ipcMain,
    createHandlers({ name: app.getName(), version: app.getVersion(), platform: platform() }),
    {
      isTrustedUrl: (url) => isAppUrl(url, devServerUrl),
      onError: (channel, error) => console.error(`[ipc] ${channel} failed`, error),
    },
  );

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
