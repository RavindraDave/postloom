import {
  _electron as electron,
  test as base,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');

interface Fixtures {
  electronApp: ElectronApplication;
  page: Page;
}

/** Launches the built app (run `electron-vite build` first; `pnpm e2e` does). */
export const test = base.extend<Fixtures>({
  // Playwright requires an object pattern here even when no fixtures are used.
  // eslint-disable-next-line no-empty-pattern
  electronApp: async ({}, use) => {
    // Chromium refuses to start as root with its OS sandbox (container dev
    // environments). CI runners are not root, so the sandbox is on there.
    const runningAsRoot = process.getuid?.() === 0;
    const app = await electron.launch({
      args: [...(runningAsRoot ? ['--no-sandbox'] : []), appDir],
      env: { ...process.env, NODE_ENV: 'production' },
    });
    await use(app);
    await app.close();
  },
  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await use(page);
  },
});

export { expect } from '@playwright/test';
