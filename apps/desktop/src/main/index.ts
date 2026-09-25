import { AppError } from '@postloom/core';
import { createRepositories, type OpenedDatabase } from '@postloom/db';
import { app, BrowserWindow, dialog, ipcMain, nativeImage, safeStorage, session } from 'electron';
import { readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { join } from 'node:path';
import { serveAppProtocol, registerAppScheme, type AssetReader } from './app-protocol';
import type { PickedFile } from './assets';
import { MAX_IMAGE_FILE_BYTES } from './images';
import { databaseLocation, openAppDatabase } from './database';
import { createHandlers } from './handlers';
import { registerIpcHandlers } from './ipc-router';
import { createSecretVault } from './secrets';
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

// Tests and development can point Postloom at a throwaway data folder.
// Never honoured in the installed app, so real data can't be redirected.
const userDataOverride = app.isPackaged ? undefined : process.env['POSTLOOM_USER_DATA_DIR'];
if (userDataOverride) app.setPath('userData', userDataOverride);

let database: OpenedDatabase | null = null;

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

function askAboutDamagedDatabase(
  latest: { fileName: string; createdAt: Date } | null,
): 'restore-latest' | 'quit' {
  const detail = latest
    ? `The newest backup is from ${latest.createdAt.toLocaleString()}. Restoring it keeps a copy of the damaged file, just in case.`
    : 'There is no backup to restore. Please contact support. Your file has not been changed.';
  const buttons = latest ? ['Restore the backup', 'Quit'] : ['Quit'];
  const choice = dialog.showMessageBoxSync({
    type: 'warning',
    title: 'Postloom',
    message: "Postloom couldn't read its saved information.",
    detail,
    buttons,
    defaultId: 0,
    cancelId: buttons.length - 1,
  });
  return latest && choice === 0 ? 'restore-latest' : 'quit';
}

void app.whenReady().then(async () => {
  hardenSession(session.defaultSession);
  let readAsset: AssetReader | null = null;
  serveAppProtocol(join(import.meta.dirname, '../renderer'), () => readAsset);

  database = await openAppDatabase(
    databaseLocation(app.getPath('userData')),
    askAboutDamagedDatabase,
  );
  if (!database) {
    app.quit();
    return;
  }

  const repos = createRepositories(database.db);
  readAsset = (id) => repos.assets.read(id);

  registerIpcHandlers(
    ipcMain,
    createHandlers({
      appInfo: { name: app.getName(), version: app.getVersion(), platform: platform() },
      repos,
      vault: createSecretVault(safeStorage, process.platform),
      extraCa: testExtraCa(),
      codec: {
        decode: (bytes) => {
          const image = nativeImage.createFromBuffer(Buffer.from(bytes));
          return image.isEmpty() ? null : image;
        },
      },
      pickImageFile,
    }),
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

/** The computer's own file picker, for PNG and JPEG pictures. */
async function pickImageFile(): Promise<PickedFile | null> {
  // End-to-end tests can't click a native dialog; never honoured when installed.
  const testFile = app.isPackaged ? undefined : process.env['POSTLOOM_TEST_PICK_IMAGE'];
  let path = testFile;
  if (!path) {
    const window = BrowserWindow.getFocusedWindow();
    const options = {
      title: 'Choose a picture',
      properties: ['openFile' as const],
      filters: [{ name: 'Pictures', extensions: ['png', 'jpg', 'jpeg'] }],
    };
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    path = result.canceled ? undefined : result.filePaths[0];
  }
  if (!path) return null;
  // Check the size before reading, so a huge file is never loaded into memory.
  if ((await stat(path)).size > MAX_IMAGE_FILE_BYTES) {
    throw new AppError({ code: 'VALIDATION_FAILED', messageKey: 'errors.imageTooBig' });
  }
  return { name: basename(path), bytes: new Uint8Array(await readFile(path)) };
}

/**
 * Lets end-to-end tests trust a local test mail server's certificate.
 * Ignored in packaged builds, so it can never weaken a user's installation.
 */
function testExtraCa(): string | undefined {
  const file = process.env['POSTLOOM_TEST_EXTRA_CA_FILE'];
  if (app.isPackaged || !file) return undefined;
  return readFileSync(file, 'utf8');
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  void database?.close();
  database = null;
});
