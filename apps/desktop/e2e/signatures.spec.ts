import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, firstPage, launchApp, test } from './fixtures';
import { startTestMailServer } from './mail-server';

const ADDRESS = 'asha@example.com';
const PASSWORD = 'abcd efgh ijkl mnop';

test('adds the sender’s signature to its emails, unless a template leaves it off', async ({
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

  // The sender's signature.
  await page.getByRole('link', { name: 'Senders & accounts' }).click();
  await page.getByRole('textbox', { name: 'Signature' }).fill('Asha Kapoor\nClub secretary');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Sender saved')).toBeVisible();

  await page.getByRole('link', { name: 'Templates' }).click();
  await page.getByRole('button', { name: 'New template' }).first().click();
  await page.getByRole('button', { name: 'Make template' }).click();
  await page.getByRole('combobox', { name: 'From' }).click();
  await page.getByRole('option', { name: /Asha Kapoor/ }).click();
  await expect(page.getByTestId('letter-signature')).toHaveText(/Club secretary/);
  await expect(page.getByTestId('save-status')).toHaveText('Saved');

  await page.getByRole('button', { name: 'Send me a test' }).click();
  await expect(page.getByText(`Test sent to ${ADDRESS}`)).toBeVisible();
  expect(mail.received[0]?.raw).toContain('Club secretary');

  // This template leaves it off.
  await page.getByRole('switch', { name: "Add the sender's signature" }).uncheck();
  await expect(page.getByTestId('letter-signature')).toHaveCount(0);
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(
    page.frameLocator('iframe[title="Email preview"]').getByText('Club secretary'),
  ).toHaveCount(0);

  await app.close();
  await mail.close();
});
