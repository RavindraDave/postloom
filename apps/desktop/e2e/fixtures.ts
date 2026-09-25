import {
  _electron as electron,
  test as base,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Launches the built app (run `electron-vite build` first; `pnpm e2e` does)
 * with its data in `userDataDir`, so tests never touch real data and can
 * relaunch on the same data to check that it was saved.
 */
export async function launchApp(
  userDataDir: string,
  extraEnv: Record<string, string> = {},
): Promise<ElectronApplication> {
  // Chromium refuses to start as root with its OS sandbox (container dev
  // environments). CI runners are not root, so the sandbox is on there.
  const runningAsRoot = process.getuid?.() === 0;
  // Linux CI has no unlocked keyring; use Electron's basic store instead of
  // waiting on one. The app reports this as "weak" protection.
  const linuxPasswordStore = process.platform === 'linux' ? ['--password-store=basic'] : [];
  return electron.launch({
    args: [...(runningAsRoot ? ['--no-sandbox'] : []), ...linuxPasswordStore, appDir],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      POSTLOOM_USER_DATA_DIR: userDataDir,
      ...extraEnv,
    },
  });
}

export async function firstPage(app: ElectronApplication): Promise<Page> {
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return page;
}

interface Fixtures {
  userDataDir: string;
  electronApp: ElectronApplication;
  page: Page;
}

export const test = base.extend<Fixtures>({
  // Playwright requires an object pattern here even when no fixtures are used.
  // eslint-disable-next-line no-empty-pattern
  userDataDir: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'postloom-e2e-'));
    await use(dir);
    rmSync(dir, { recursive: true, force: true });
  },
  electronApp: async ({ userDataDir }, use) => {
    const app = await launchApp(userDataDir);
    await use(app);
    await app.close();
  },
  page: async ({ electronApp }, use) => {
    await use(await firstPage(electronApp));
  },
});

export { expect } from '@playwright/test';
