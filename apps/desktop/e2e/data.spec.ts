import { expect, firstPage, launchApp, test } from './fixtures';

test('backs up on request and keeps History and sending settings after a restart', async ({
  userDataDir,
}) => {
  let app = await launchApp(userDataDir);
  let page = await firstPage(app);
  await page.getByRole('link', { name: 'Settings' }).click();

  const backups = page.getByRole('table', { name: 'Backups' });
  // The daily backup is taken when Postloom opens.
  await expect(backups.getByText('Daily')).toBeVisible();
  await page.getByRole('button', { name: 'Back up now' }).click();
  await expect(page.getByText('Backup saved.')).toBeVisible();
  await expect(backups.getByText('You made it')).toBeVisible();

  await page.getByRole('combobox', { name: /Keep sends in History for/ }).click();
  await page.getByRole('option', { name: '1 year' }).click();
  await expect(page.getByRole('combobox', { name: /Keep sends in History for/ })).toHaveValue(
    '1 year',
  );

  const limit = page.getByRole('textbox', { name: /Most emails a day/ });
  await limit.fill('200');
  await limit.blur();
  await expect(page.getByText('Version 0.1.0')).toBeVisible();

  await app.close();
  app = await launchApp(userDataDir);
  page = await firstPage(app);
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('combobox', { name: /Keep sends in History for/ })).toHaveValue(
    '1 year',
  );
  await expect(page.getByRole('table', { name: 'Backups' }).getByText('You made it')).toBeVisible();
  await expect(page.getByRole('textbox', { name: /Most emails a day/ })).toHaveValue('200');
  await app.close();
});
