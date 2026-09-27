import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expectAccessible } from './a11y';
import { expect, firstPage, launchApp, test } from './fixtures';
import { startTestMailServer, type TestMailServer } from './mail-server';

const ADDRESS = 'asha@example.com';
const PASSWORD = 'abcd efgh ijkl mnop';

let mail: TestMailServer;

test.beforeEach(async () => {
  mail = await startTestMailServer({ username: ADDRESS, password: PASSWORD });
});
test.afterEach(async () => {
  await mail.close();
});

test('first-run setup connects an account and sends a real test email', async ({ userDataDir }) => {
  const caFile = join(userDataDir, 'test-ca.pem');
  writeFileSync(caFile, mail.caPem);
  const app = await launchApp(userDataDir, { POSTLOOM_TEST_EXTRA_CA_FILE: caFile });
  const page = await firstPage(app);

  await page.getByRole('button', { name: 'Connect your email' }).click();
  await page.getByRole('button', { name: "Let's start" }).click();
  await page.getByRole('radio', { name: /Something else/ }).check();
  await page.getByRole('button', { name: 'Continue with Something else' }).click();

  await page.getByLabel('Your email address').fill(ADDRESS);
  await page.getByLabel(/^Password/).fill('wrong password');
  await page.getByLabel('Outgoing mail server (SMTP)').fill('localhost');
  await page.getByLabel('Port').fill(String(mail.port));
  await page.getByLabel('A name for this account (optional)').fill('Office mail');

  // A wrong password is explained, and nothing is saved.
  await page.getByRole('button', { name: 'Check and save' }).click();
  await expect(page.getByRole('alert')).toContainText("didn't accept the password");

  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Check and save' }).click();

  await page.getByLabel('Name people see').fill('Asha Kapoor');
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: 'Send the test email' }).click();
  await expect(page.getByText('Sent! Check your inbox')).toBeVisible();
  expect(mail.received).toHaveLength(1);
  expect(mail.received[0]?.to).toEqual([ADDRESS]);
  expect(mail.received[0]?.raw).toContain('Subject: Postloom test email');

  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: "You're all set" })).toBeVisible();
  await page.getByRole('button', { name: 'Go to Home' }).click();
  await expect(page.getByText('Office mail is ready.')).toBeVisible();

  // The account and sender show on Senders & accounts.
  await page.getByRole('link', { name: 'Senders & accounts' }).click();
  await expect(page.getByRole('button', { name: /Asha Kapoor/ })).toBeVisible();
  await expectAccessible(page, 'Senders & accounts, with an account');
  await expect(page.getByRole('region', { name: 'Office mail' })).toContainText('Working');

  await app.close();

  // The password is encrypted at rest: it appears in no database file.
  for (const file of readdirSync(userDataDir).filter((name) =>
    name.startsWith('postloom.sqlite'),
  )) {
    expect(readFileSync(join(userDataDir, file)).includes(PASSWORD)).toBe(false);
  }
});

test('the saved account keeps working after a restart', async ({ userDataDir }) => {
  const caFile = join(userDataDir, 'test-ca.pem');
  writeFileSync(caFile, mail.caPem);
  const env = { POSTLOOM_TEST_EXTRA_CA_FILE: caFile };

  let app = await launchApp(userDataDir, env);
  let page = await firstPage(app);
  await page.getByRole('link', { name: 'Senders & accounts' }).click();
  await page.getByRole('button', { name: 'Connect your email' }).click();
  await page.getByRole('button', { name: "Let's start" }).click();
  await page.getByRole('radio', { name: /Something else/ }).check();
  await page.getByRole('button', { name: 'Continue with Something else' }).click();
  await page.getByLabel('Your email address').fill(ADDRESS);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByLabel('Outgoing mail server (SMTP)').fill('localhost');
  await page.getByLabel('Port').fill(String(mail.port));
  await page.getByRole('button', { name: 'Check and save' }).click();
  await expect(page.getByRole('heading', { name: 'Who are your emails from?' })).toBeVisible();
  await app.close();

  app = await launchApp(userDataDir, env);
  page = await firstPage(app);
  await page.getByRole('link', { name: 'Senders & accounts' }).click();
  const card = page.getByRole('region', { name: ADDRESS });
  await card.getByRole('button', { name: 'Send me a test email' }).click();
  await expect(page.getByText(`Test email sent to ${ADDRESS}`)).toBeVisible();
  expect(mail.received).toHaveLength(1);
  await app.close();
});
