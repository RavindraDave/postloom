import type { Page } from '@playwright/test';
import { accessibilityProblems } from './a11y';
import { expect, test } from './fixtures';

async function open(page: Page, route: string, ready: (page: Page) => Promise<void>) {
  await page.evaluate((hash) => {
    window.location.hash = hash;
  }, route);
  await ready(page);
  // Let transitions finish, so colours are measured as they end up.
  await page.waitForTimeout(250);
}

const heading = (name: string | RegExp) => (page: Page) =>
  expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();

for (const scheme of ['light', 'dark'] as const) {
  test(`every empty screen passes automated accessibility checks (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const template = await page.evaluate(async () => {
      const created = await window.postloom.templates.create({ name: 'Invoice', subject: 'Hi' });
      if (!created.ok) throw new Error('Could not make a template');
      return created.data.id;
    });

    const screens: [string, (page: Page) => Promise<void>][] = [
      ['#/', heading('Welcome to Postloom')],
      ['#/setup', (p) => expect(p.getByRole('button', { name: "Let's start" })).toBeVisible()],
      ['#/send', heading('Send emails')],
      ['#/templates', heading('Templates')],
      [`#/templates/${template}`, (p) => expect(p.getByRole('textbox').first()).toBeVisible()],
      ['#/senders', heading('Senders & accounts')],
      ['#/history', heading('History')],
      ['#/settings', heading('Settings')],
      ['#/help', heading('Help')],
      ['#/help/sending', heading('Sending safely')],
    ];

    const found: string[] = [];
    for (const [route, ready] of screens) {
      await open(page, route, ready);
      found.push(...(await accessibilityProblems(page)).map((line) => `${route} ${line}`));
    }
    expect(found).toEqual([]);
  });
}

test('the keyboard can skip the sidebar, and each page is named', async ({ page }) => {
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  await expect(page).toHaveTitle('Postloom');

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveTitle('Settings - Postloom');
  // After a page change, the next Tab starts in the page, not back in the sidebar.
  await expect(page.locator('#main-content')).toBeFocused();
});
