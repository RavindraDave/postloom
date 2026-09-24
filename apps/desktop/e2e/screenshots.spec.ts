import { test } from './fixtures';

// Not part of the regular suite: run with SCREENSHOTS=1 to refresh docs/images.
test.skip(!process.env['SCREENSHOTS'], 'screenshots only on demand');

const out = '../../docs/images';

test('capture screens for review', async ({ electronApp, page }) => {
  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1280, 820);
  });

  await page.getByRole('link', { name: 'Templates' }).click();
  for (const name of ['Payment reminder', 'Thank you note']) {
    await page.getByRole('button', { name: 'New template' }).first().click();
    await page.getByLabel('Name').fill(name);
    await page.getByRole('button', { name: 'Make template' }).click();
    await page.getByRole('button', { name: new RegExp(name) }).waitFor();
  }

  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.getByRole('link', { name: 'Home' }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/home-${scheme}.png` });
    await page.getByRole('link', { name: 'Templates' }).click();
    await page
      .frameLocator('iframe[title="Email preview"]')
      .getByText('Dear [First Name],')
      .waitFor();
    await page.screenshot({ path: `${out}/templates-${scheme}.png` });
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/settings-${scheme}.png` });
  }
});
