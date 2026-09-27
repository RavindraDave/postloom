// Renders resources/icon.svg to resources/icon.png (1024×1024), which
// electron-builder turns into the Windows, macOS and Linux icons, and the
// Microsoft Store tiles in resources/appx (without them the Store package
// would carry electron-builder's sample logos).
// Run after changing the SVG: node scripts/render-icon.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const resources = join(import.meta.dirname, '..', 'resources');
const svg = readFileSync(join(resources, 'icon.svg'), 'utf8');
// The white mark on its own, to place on the brand colour at any size.
const mark = /<g[\s\S]*<\/g>/.exec(svg)?.[0];
if (!mark) throw new Error('icon.svg has no <g> mark');
const BRAND = '#0E6B66';

/** The mark centred on the brand colour, filling a width × height tile. */
function tile(width, height, markShare) {
  const size = Math.min(width, height) * markShare;
  // The mark's <g> draws in a 600px box (24 units × 25) starting at 212.
  const scale = size / 600;
  const x = (width - size) / 2 - 212 * scale;
  const y = (height - size) / 2 - 212 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="${width}" height="${height}" fill="${BRAND}"/>
    <g transform="translate(${x} ${y}) scale(${scale})">${mark}</g></svg>`;
}

// Name, width, height, and how much of the tile the mark fills.
const STORE_TILES = [
  ['StoreLogo', 50, 50, 0.7],
  ['Square44x44Logo', 44, 44, 0.75],
  ['Square150x150Logo', 150, 150, 0.5],
  ['Wide310x150Logo', 310, 150, 0.5],
];

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const render = async (content, width, height, path) => {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${content}</body></html>`,
  );
  await page.locator('svg').first().screenshot({ path, omitBackground: true });
  await page.close();
};

await render(svg, 1024, 1024, join(resources, 'icon.png'));

const appx = join(resources, 'appx');
mkdirSync(appx, { recursive: true });
for (const [name, width, height, share] of STORE_TILES) {
  for (const [suffix, factor] of [
    ['', 1],
    ['.scale-200', 2],
  ]) {
    const w = width * factor;
    const h = height * factor;
    await render(tile(w, h, share), w, h, join(appx, `${name}${suffix}.png`));
  }
}
await browser.close();
