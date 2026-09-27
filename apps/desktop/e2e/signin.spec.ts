import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, firstPage, launchApp, sendWithoutWaiting, test } from './fixtures';
import { startTestMailServer } from './mail-server';
import { startFakeOAuth } from './oauth-server';

test('connects Gmail by signing in with Google, and sends through the Gmail API', async ({
  userDataDir,
}) => {
  const fake = await startFakeOAuth({ google: 'asha@gmail.example' });
  const app = await launchApp(userDataDir, {
    POSTLOOM_TEST_OAUTH_BASE: fake.base,
    POSTLOOM_TEST_GMAIL_API: fake.base,
  });
  const page = await firstPage(app);

  await page.getByRole('button', { name: 'Connect your email' }).click();
  await page.getByRole('button', { name: "Let's start" }).click();
  await page.getByRole('radio', { name: /Gmail/ }).check();
  await expect(page.getByText('Next: sign in with Google')).toBeVisible();
  await page.getByRole('button', { name: 'Continue with Gmail' }).click();
  // The app password is still there for those who want it.
  await expect(page.getByRole('button', { name: 'Use an app password instead' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in with Google' }).click();

  await page.getByLabel('Name people see').fill('Asha Kapoor');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Send the test email' }).click();
  await expect(page.getByText('Sent! Check your inbox')).toBeVisible();
  expect(fake.gmailSent).toHaveLength(1);
  expect(fake.gmailSent[0]?.raw).toContain('To: asha@gmail.example');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Go to Home' }).click();

  await page.getByRole('link', { name: 'Senders & accounts' }).click();
  await page.getByRole('tab', { name: /Email accounts/ }).click();
  const card = page.getByRole('region', { name: 'asha@gmail.example' });
  await expect(card).toContainText('Signed in with Google');

  // Access removed at Google (password changed): Postloom asks to sign in again.
  fake.validRefreshTokens.clear();
  fake.validAccessTokens.clear();
  await app.evaluate(() => undefined);
  await card.getByRole('button', { name: 'Check now' }).click();
  await expect(
    card.getByRole('heading', { name: /Sign in to asha@gmail.example again/ }),
  ).toBeVisible();
  await card.getByRole('button', { name: 'Sign in with Google again' }).click();
  await expect(card).not.toContainText('Sign in to asha@gmail.example again');

  await app.close();
  await fake.close();
});

test('connects Outlook by signing in with Microsoft, and sends over SMTP with the token', async ({
  userDataDir,
}) => {
  const fake = await startFakeOAuth({ microsoft: 'asha@outlook.example' });
  const mail = await startTestMailServer(
    { username: 'asha@outlook.example', password: 'unused' },
    { oauthTokens: fake.validAccessTokens },
  );
  const caFile = join(userDataDir, 'test-ca.pem');
  writeFileSync(caFile, mail.caPem);
  const app = await launchApp(userDataDir, {
    POSTLOOM_TEST_OAUTH_BASE: fake.base,
    POSTLOOM_TEST_MICROSOFT_SMTP: `localhost:${String(mail.port)}`,
    POSTLOOM_TEST_EXTRA_CA_FILE: caFile,
  });
  const page = await firstPage(app);

  await page.getByRole('button', { name: 'Connect your email' }).click();
  await page.getByRole('button', { name: "Let's start" }).click();
  await page.getByRole('radio', { name: /Outlook/ }).check();
  await page.getByRole('button', { name: 'Continue with Outlook' }).click();
  await page.getByRole('button', { name: 'Sign in with Microsoft' }).click();

  await page.getByLabel('Name people see').fill('Asha Kapoor');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Send the test email' }).click();
  await expect(page.getByText('Sent! Check your inbox')).toBeVisible();
  expect(mail.received).toHaveLength(1);
  expect(mail.received[0]?.to).toEqual(['asha@outlook.example']);

  await app.close();
  await mail.close();
  await fake.close();
});

test('a send from a Google account carries on when its access runs out part-way', async ({
  userDataDir,
}) => {
  const fake = await startFakeOAuth({ google: 'asha@gmail.example' });
  const listFile = join(userDataDir, 'invoices.csv');
  writeFileSync(
    listFile,
    [
      'Email,First Name,Invoice No,Amount,Due Date',
      'p1@example.com,Pia,INV-1,£1,1 Oct',
      'p2@example.com,Raj,INV-2,£2,2 Oct',
    ].join('\n'),
  );
  const app = await launchApp(userDataDir, {
    POSTLOOM_TEST_OAUTH_BASE: fake.base,
    POSTLOOM_TEST_GMAIL_API: fake.base,
    POSTLOOM_TEST_PICK_SPREADSHEET: listFile,
  });
  const page = await firstPage(app);
  await sendWithoutWaiting(page);

  await page.getByRole('button', { name: 'Connect your email' }).click();
  await page.getByRole('button', { name: "Let's start" }).click();
  await page.getByRole('radio', { name: /Gmail/ }).check();
  await page.getByRole('button', { name: 'Continue with Gmail' }).click();
  await page.getByRole('button', { name: 'Sign in with Google' }).click();
  await page.getByLabel('Name people see').fill('Asha Kapoor');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.getByRole('button', { name: 'Go to Home' }).click();

  await page.getByRole('link', { name: 'Templates' }).click();
  await page.getByRole('button', { name: 'New template' }).first().click();
  await page.getByRole('radio', { name: /Payment reminder/ }).check();
  await page.getByRole('button', { name: 'Make template' }).click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved');

  // Google stops accepting the current access (it expired); the refresh still works.
  fake.validAccessTokens.clear();

  await page.getByRole('link', { name: 'Send emails' }).click();
  await page.getByRole('button', { name: 'Choose a file…' }).click();
  await expect(page.getByText('2 people on this list')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('combobox', { name: 'Template' }).click();
  await page.getByRole('option', { name: 'Payment reminder' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue without a test' }).click();
  await page.getByRole('button', { name: 'Continue' }).first().click();
  await page.getByRole('button', { name: 'Send now' }).click();

  await expect(page.getByRole('status').filter({ hasText: /^Done! 2 emails sent\.$/ })).toBeVisible(
    { timeout: 30_000 },
  );
  expect(fake.gmailSent.map((sent) => /To: (\S+)/.exec(sent.raw)?.[1])).toEqual([
    'p1@example.com',
    'p2@example.com',
  ]);

  await app.close();
  await fake.close();
});
