import { AppError } from '@postloom/core';
import { createRepositories, type OpenedDatabase } from '@postloom/db';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeImage,
  Notification,
  powerMonitor,
  safeStorage,
  session,
  utilityProcess,
} from 'electron';
import { readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { join } from 'node:path';
import { serveAppProtocol, registerAppScheme, type AssetReader } from './app-protocol';
import type { PickedFile } from './assets';
import { MAX_IMAGE_FILE_BYTES } from './images';
import { MAX_SPREADSHEET_BYTES } from '@postloom/recipients';
import { databaseLocation, openAppDatabase } from './database';
import { createMainServices } from './handlers';
import { registerIpcHandlers } from './ipc-router';
import { createSecretVault } from './secrets';
import { createProcessRunner } from './send-runner';
import type { SendService } from './sends';
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
let sendService: SendService | null = null;
let quittingAfterSend = false;

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

  const location = databaseLocation(app.getPath('userData'));
  database = await openAppDatabase(location, askAboutDamagedDatabase);
  if (!database) {
    app.quit();
    return;
  }

  const repos = createRepositories(database.db);
  readAsset = (id) => repos.assets.read(id);
  // Anyone left mid-send by a crash or forced quit becomes "uncertain" (never resent without asking).
  await repos.sends.recoverInterrupted();

  const services = createMainServices({
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
    pickHtmlFile,
    pickSpreadsheetFile,
    createSendRunner: (events) =>
      createProcessRunner(
        {
          fork: () =>
            utilityProcess.fork(join(import.meta.dirname, 'sender.js'), [], {
              serviceName: 'Postloom sending',
            }),
          dbFile: location.file,
        },
        events,
      ),
    notify: (title, body) => {
      if (Notification.isSupported()) new Notification({ title, body }).show();
    },
  });
  sendService = services.sends;
  watchSleep(services.sends);

  registerIpcHandlers(ipcMain, services.handlers, {
    isTrustedUrl: (url) => isAppUrl(url, devServerUrl),
    onError: (channel, error) => console.error(`[ipc] ${channel} failed`, error),
  });

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

/** HTML files larger than this are refused (email HTML is far smaller). */
const MAX_HTML_FILE_BYTES = 2 * 1024 * 1024;

/** The computer's own file picker, for an HTML email to import. */
async function pickHtmlFile(): Promise<{ name: string; html: string } | null> {
  const testFile = app.isPackaged ? undefined : process.env['POSTLOOM_TEST_PICK_HTML'];
  let path = testFile;
  if (!path) {
    const window = BrowserWindow.getFocusedWindow();
    const options = {
      title: 'Choose an HTML email',
      properties: ['openFile' as const],
      filters: [{ name: 'Web pages', extensions: ['html', 'htm'] }],
    };
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    path = result.canceled ? undefined : result.filePaths[0];
  }
  if (!path) return null;
  if ((await stat(path)).size > MAX_HTML_FILE_BYTES) {
    throw new AppError({ code: 'VALIDATION_FAILED', messageKey: 'errors.htmlTooBig' });
  }
  return { name: basename(path), html: await readFile(path, 'utf8') };
}

/** The computer's own file picker, for a list of people (Excel or CSV). */
async function pickSpreadsheetFile(): Promise<PickedFile | null> {
  const testFile = app.isPackaged ? undefined : process.env['POSTLOOM_TEST_PICK_SPREADSHEET'];
  let path = testFile;
  if (!path) {
    const window = BrowserWindow.getFocusedWindow();
    const options = {
      title: 'Choose your list of people',
      properties: ['openFile' as const],
      filters: [{ name: 'Spreadsheets', extensions: ['xlsx', 'csv', 'txt'] }],
    };
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    path = result.canceled ? undefined : result.filePaths[0];
  }
  if (!path) return null;
  if ((await stat(path)).size > MAX_SPREADSHEET_BYTES) {
    throw new AppError({ code: 'VALIDATION_FAILED', messageKey: 'errors.spreadsheetTooBig' });
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

/** Sending pauses when the computer sleeps and carries on when it wakes (PLAN.md §9). */
function watchSleep(sends: SendService) {
  powerMonitor.on('suspend', () => {
    sends.pauseAll('sleep');
  });
  powerMonitor.on('resume', () => {
    void sends.wake();
  });
}

// Quitting while emails are going out: ask, then stop after the current email.
app.on('before-quit', (event) => {
  const sends = sendService;
  if (!sends?.isSending() || quittingAfterSend) return;
  event.preventDefault();
  const choice = dialog.showMessageBoxSync({
    type: 'question',
    title: 'Postloom',
    message: 'Emails are still being sent.',
    detail: 'Stop after the current email and quit? You can carry on sending the rest later.',
    buttons: ['Stop and quit', 'Keep sending'],
    defaultId: 1,
    cancelId: 1,
  });
  if (choice !== 0) return;
  quittingAfterSend = true;
  sends.stopAll();
  const started = Date.now();
  const wait = setInterval(() => {
    if (!sends.isSending() || Date.now() - started > 60_000) {
      clearInterval(wait);
      app.quit();
    }
  }, 200);
});

app.on('will-quit', () => {
  void database?.close();
  database = null;
});
