import { test } from './fixtures';

// Not part of the regular suite: run with SCREENSHOTS=1 to refresh docs/images.
test.skip(!process.env['SCREENSHOTS'], 'screenshots only on demand');

const out = '../../docs/images';

test('capture screens for review', async ({ electronApp, page }) => {
  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1280, 820);
  });
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.getByRole('link', { name: 'Home' }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/phase0-home-${scheme}.png` });
    await page.getByRole('link', { name: 'Templates' }).click();
    await page.frameLocator('iframe[title="Email preview"]').getByText('Hello Asha,').waitFor();
    await page.screenshot({ path: `${out}/phase0-templates-${scheme}.png` });
  }
});
