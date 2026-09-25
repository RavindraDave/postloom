import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, firstPage, launchApp, test } from './fixtures';

test('finds a help article and exports diagnostics without personal details', async ({
  userDataDir,
}) => {
  const diagnosticsFile = join(userDataDir, 'diagnostics.json');
  const app = await launchApp(userDataDir, { POSTLOOM_TEST_SAVE_FILE: diagnosticsFile });
  const page = await firstPage(app);

  await page.getByRole('link', { name: 'Help', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search help' }).fill('app password');
  await page
    .getByRole('navigation', { name: 'Help' })
    .getByRole('link', { name: /Connecting Gmail/ })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Connecting Gmail or Google Workspace' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'All help' }).click();

  await page.getByRole('button', { name: 'Export diagnostics' }).click();
  await expect(page.getByText(/Saved as/)).toBeVisible();
  const diagnostics = JSON.parse(readFileSync(diagnosticsFile, 'utf8')) as {
    accounts: { count: number };
  };
  expect(diagnostics.accounts.count).toBe(0);
  await app.close();
});
