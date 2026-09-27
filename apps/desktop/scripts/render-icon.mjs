// Renders resources/icon.svg to resources/icon.png (1024×1024), which
// electron-builder turns into the Windows, macOS and Linux icons.
// Run after changing the SVG: node scripts/render-icon.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const resources = join(import.meta.dirname, '..', 'resources');
const svg = readFileSync(join(resources, 'icon.svg'), 'utf8');
// CHROMIUM_PATH: a Chromium to use when Playwright's own isn't installed.
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
await page.locator('svg').screenshot({ path: join(resources, 'icon.png'), omitBackground: true });
await browser.close();
