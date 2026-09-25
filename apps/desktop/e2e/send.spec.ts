import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, firstPage, launchApp, test } from './fixtures';
import { startTestMailServer } from './mail-server';

const ADDRESS = 'asha@example.com';
const PASSWORD = 'abcd efgh ijkl mnop';

const LIST = [
  'Email,First Name,Invoice No,Amount,Due Date',
  'ben@example.com,Ben,INV-1001,£120.00,1 October',
  'not an address,Cara,INV-1002,£80.00,2 October',
  'dan@example.com,Dan,INV-1003,£45.50,3 October',
].join('\n');

test('checks a list, previews each person and sends a test with their details', async ({
  userDataDir,
}) => {
  const mail = await startTestMailServer({ username: ADDRESS, password: PASSWORD });
  const caFile = join(userDataDir, 'test-ca.pem');
  writeFileSync(caFile, mail.caPem);
  const listFile = join(userDataDir, 'invoices.csv');
  writeFileSync(listFile, LIST);
  const app = await launchApp(userDataDir, {
    POSTLOOM_TEST_EXTRA_CA_FILE: caFile,
    POSTLOOM_TEST_PICK_SPREADSHEET: listFile,
  });
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

  await page.getByRole('link', { name: 'Templates' }).click();
  await page.getByRole('button', { name: 'New template' }).first().click();
  await page.getByRole('radio', { name: /Payment reminder/ }).check();
  await page.getByRole('button', { name: 'Make template' }).click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved');

  // 1. Who to send to.
  await page.getByRole('link', { name: 'Send emails' }).click();
  await page.getByRole('button', { name: 'Choose a file…' }).click();
  await expect(page.getByText('invoices.csv')).toBeVisible();
  await expect(page.getByText('3 people on this list')).toBeVisible();
  await expect(page.getByRole('combobox', { name: /Send to/ })).toHaveValue('Email');
  await expect(page.getByRole('table').getByText('INV-1003')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  // 2. Template and sender; details match columns of the same name.
  await page.getByRole('combobox', { name: 'Template' }).click();
  await page.getByRole('option', { name: 'Payment reminder' }).click();
  await expect(page.getByRole('combobox', { name: 'Invoice No' })).toHaveValue('Invoice No');
  await expect(page.getByRole('combobox', { name: /Send as/ })).toHaveValue(/asha@example.com/);
  await page.getByRole('button', { name: 'Continue' }).click();

  // 3. Check: the bad address must be fixed; leave that row out.
  const mustFix = page.getByRole('region', { name: 'Must fix before sending' });
  await expect(mustFix).toContainText("1 row has an email address that isn't valid.");
  await expect(mustFix).toContainText('Row 3');
  await mustFix.getByRole('button', { name: 'Leave these rows out' }).click();
  await expect(page.getByText('2 emails will be sent from Asha Kapoor.')).toBeVisible();
  await expect(page.getByText('Left out: 1 you chose.')).toBeVisible();

  // Step through each person's email.
  await expect(page.getByText('Person 1 of 2')).toBeVisible();
  await expect(page.getByText('ben@example.com')).toBeVisible();
  await expect(
    page.frameLocator('iframe[title="Email preview"]').getByText(/INV-1001/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Next person' }).click();
  await expect(page.getByText('Person 2 of 2')).toBeVisible();
  await expect(page.getByText('dan@example.com')).toBeVisible();
  await expect(
    page.frameLocator('iframe[title="Email preview"]').getByText(/INV-1003/),
  ).toBeVisible();

  // A real test with Dan's details, sent to me (never to Dan).
  await page.getByRole('button', { name: "Send this person's email to me" }).click();
  await expect(
    page.getByText(`Test sent to ${ADDRESS}, with the details from row 4.`),
  ).toBeVisible();
  expect(mail.received).toHaveLength(1);
  const raw = mail.received[0]?.raw ?? '';
  expect(raw).toContain(`To: ${ADDRESS}`);
  expect(raw).not.toContain('dan@example.com');
  expect(raw).toContain('Subject: [Test]');
  expect(raw).toContain('INV-1003');
  expect(raw).not.toContain('[Invoice No]');

  // 4. The confirmation.
  await page.getByRole('button', { name: 'Continue' }).first().click();
  await expect(page.getByText(/^Send 2 emails from .+ as .+\?$/)).toBeVisible();

  await app.close();
  await mail.close();
});
