import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { firstPage, launchApp, test } from './fixtures';
import { startTestMailServer } from './mail-server';

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
    await page.getByRole('textbox', { name: 'Template name' }).waitFor();
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Templates' })
      .click();
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

test('capture setup and senders screens', async ({ userDataDir }) => {
  const mail = await startTestMailServer({ username: 'asha@brightlane.example', password: 'pw' });
  const caFile = join(userDataDir, 'test-ca.pem');
  writeFileSync(caFile, mail.caPem);
  const app = await launchApp(userDataDir, { POSTLOOM_TEST_EXTRA_CA_FILE: caFile });
  const page = await firstPage(app);
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1280, 820);
  });

  await page.getByRole('button', { name: 'Connect your email' }).click();
  await page.getByRole('button', { name: "Let's start" }).click();
  await page.getByRole('radio', { name: /Gmail/ }).check();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/setup-provider-light.png` });

  await page.getByRole('radio', { name: /Something else/ }).check();
  await page.getByRole('button', { name: 'Continue with Something else' }).click();
  await page.getByLabel('Your email address').fill('asha@brightlane.example');
  await page.getByLabel(/^Password/).fill('pw');
  await page.getByLabel('Outgoing mail server (SMTP)').fill('localhost');
  await page.getByLabel('Port').fill(String(mail.port));
  await page.getByLabel('A name for this account (optional)').fill('Office mail');
  await page.getByRole('button', { name: 'Check and save' }).click();
  await page.getByLabel('Name people see').fill('Asha Kapoor');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.getByRole('button', { name: 'Go to Home' }).click();

  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.getByRole('link', { name: 'Home' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/home-checklist-${scheme}.png` });
    await page.getByRole('link', { name: 'Senders & accounts' }).click();
    await page.getByRole('tab', { name: /Senders/ }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/senders-${scheme}.png` });
    await page.getByRole('tab', { name: /Email accounts/ }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/accounts-${scheme}.png` });
  }

  // The Write-mode editor.
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('link', { name: 'Templates' }).click();
  await page.getByRole('button', { name: 'New template' }).first().click();
  await page.getByRole('radio', { name: /Payment reminder/ }).check();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/new-template-light.png` });
  await page.getByRole('button', { name: 'Make template' }).click();
  await page.getByRole('combobox', { name: 'From' }).click();
  await page.getByRole('option', { name: /Asha Kapoor/ }).click();
  await page.getByTestId('save-status').filter({ hasText: 'Saved' }).waitFor();
  await page.waitForTimeout(600);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/editor-${scheme}.png` });
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('button', { name: 'Preview' }).click();
  await page.frameLocator('iframe[title="Email preview"]').getByText('Pay now').waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/editor-preview-light.png` });

  await app.close();
  await mail.close();
});
