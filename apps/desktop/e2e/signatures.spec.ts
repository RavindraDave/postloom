import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, firstPage, launchApp, test } from './fixtures';
import { startTestMailServer } from './mail-server';

const ADDRESS = 'asha@example.com';
const PASSWORD = 'abcd efgh ijkl mnop';

test('puts the sender’s formatted signature where the template places it', async ({
  userDataDir,
}) => {
  const mail = await startTestMailServer({ username: ADDRESS, password: PASSWORD });
  const caFile = join(userDataDir, 'test-ca.pem');
  writeFileSync(caFile, mail.caPem);
  const app = await launchApp(userDataDir, { POSTLOOM_TEST_EXTRA_CA_FILE: caFile });
  const page = await firstPage(app);

  await page.getByRole('button', { name: 'Connect your email' }).click();
  await page.getByRole('button', { name: "Let's start" }).click();
  await page.getByRole('radio', { name: /Something else/ }).check();
  await page.getByRole('button', { name: 'Continue with Something else' }).click();
  await page.getByLabel('Your email address').fill(ADDRESS);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByLabel('Outgoing mail server (SMTP)').fill('localhost');
  await page.getByLabel('Port').fill(String(mail.port));
  await page.getByRole('button', { name: 'Check and save' }).click();
  await page.getByLabel('Name people see').fill('Asha Kapoor');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.getByRole('button', { name: 'Go to Home' }).click();

  // The sender's signature, with a bold name.
  await page.getByRole('link', { name: 'Senders & accounts' }).click();
  const signature = page.getByRole('textbox', { name: 'Signature' });
  await signature.click();
  await page.keyboard.press('ControlOrMeta+b');
  await page.keyboard.type('Asha Kapoor');
  await page.keyboard.press('ControlOrMeta+b');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Club secretary');
  await expect(signature.locator('strong', { hasText: 'Asha Kapoor' })).toBeVisible();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Sender saved')).toBeVisible();

  await page.getByRole('link', { name: 'Templates' }).click();
  await page.getByRole('button', { name: 'New template' }).first().click();
  await page.getByRole('button', { name: 'Make template' }).click();
  await page.getByRole('combobox', { name: 'From' }).click();
  await page.getByRole('option', { name: /Asha Kapoor/ }).click();

  // Nothing is added until the Signature block is placed.
  await expect(page.getByTestId('letter-signature')).toHaveCount(0);
  const letter = page.getByRole('textbox', { name: 'Email text' });
  await letter.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.getByRole('button', { name: 'Insert', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Signature' }).click();
  await expect(page.getByTestId('letter-signature')).toContainText('Club secretary');
  await expect(page.getByTestId('save-status')).toHaveText('Saved');

  await page.getByRole('button', { name: 'Preview' }).click();
  const preview = page.frameLocator('iframe[title="Email preview"]');
  await expect(preview.locator('strong', { hasText: 'Asha Kapoor' })).toBeVisible();
  await expect(preview.getByText('Club secretary')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Send me a test' }).click();
  await expect(page.getByText(`Test sent to ${ADDRESS}`)).toBeVisible();
  const raw = mail.received[0]?.raw ?? '';
  expect(raw).toContain('Club secretary');
  expect(raw).toContain('<strong>Asha Kapoor</strong>');

  await app.close();
  await mail.close();
});
