import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expectAccessible } from './a11y';
import { expect, firstPage, launchApp, test, sendWithoutWaiting } from './fixtures';
import { startTestMailServer } from './mail-server';

const ADDRESS = 'asha@example.com';
const PASSWORD = 'abcd efgh ijkl mnop';

test('sends each person their own files, then saves a report from History', async ({
  userDataDir,
}) => {
  const mail = await startTestMailServer({ username: ADDRESS, password: PASSWORD });
  const caFile = join(userDataDir, 'test-ca.pem');
  writeFileSync(caFile, mail.caPem);

  // The list sits in its own folder, with the invoices next to it.
  const listFolder = join(userDataDir, 'October');
  mkdirSync(join(listFolder, 'invoices'), { recursive: true });
  writeFileSync(join(listFolder, 'invoices', 'INV-1001.pdf'), '%PDF-1.7 invoice for Ben');
  writeFileSync(join(listFolder, 'invoices', 'INV-1003.pdf'), '%PDF-1.7 invoice for Dan');
  const elsewhere = mkdtempSync(join(tmpdir(), 'postloom-brochures-'));
  writeFileSync(join(elsewhere, 'brochure.pdf'), '%PDF-1.7 brochure');
  const listFile = join(listFolder, 'invoices.csv');
  writeFileSync(
    listFile,
    [
      'Email,First Name,Invoice No,Amount,Due Date,Attachment',
      `ben@example.com,Ben,INV-1001,£120.00,1 October,invoices/INV-1001.pdf;${join(elsewhere, 'brochure.pdf')}`,
      'cara@example.com,Cara,INV-1002,£80.00,2 October,invoices/INV-1002.pdf',
      'dan@example.com,Dan,INV-1003,£45.50,3 October,invoices/INV-1003.pdf',
    ].join('\n'),
  );
  const reportFile = join(userDataDir, 'report.csv');
  const app = await launchApp(userDataDir, {
    POSTLOOM_TEST_EXTRA_CA_FILE: caFile,
    POSTLOOM_TEST_PICK_SPREADSHEET: listFile,
    POSTLOOM_TEST_SAVE_FILE: reportFile,
  });
  const page = await firstPage(app);
  await sendWithoutWaiting(page);

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

  await page.getByRole('link', { name: 'Send emails' }).click();
  await page.getByRole('button', { name: 'Choose a file…' }).click();
  await expect(page.getByRole('combobox', { name: /Files to attach/ })).toHaveValue('Attachment');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('combobox', { name: 'Template' }).click();
  await page.getByRole('option', { name: 'Payment reminder' }).click();
  await expect(page.getByRole('combobox', { name: 'Invoice No' })).toHaveValue('Invoice No');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Cara's invoice doesn't exist; the brochure comes from a folder not used before.
  const mustFix = page.getByRole('region', { name: 'Must fix before sending' });
  await expect(mustFix).toContainText("1 row names a file to attach that can't be found.");
  await expectAccessible(page, 'the check step, with file problems');
  await mustFix.getByRole('button', { name: 'Leave these rows out' }).click();
  await expect(
    page.getByText(/Some files come from a folder you haven't used before/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'These are fine, trust these folders' }).click();
  await expect(page.getByText(/Some files come from a folder/)).toBeHidden();
  await expect(page.getByText(/^With 3 attached files/)).toBeVisible();
  await expect(page.getByText('INV-1001.pdf')).toBeVisible();
  await expect(page.getByText('brochure.pdf')).toBeVisible();

  await page.getByRole('button', { name: 'Continue without a test' }).click();
  await page.getByRole('button', { name: 'Continue' }).first().click();
  await page.getByRole('button', { name: 'Send now' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Done! 2 emails sent.' })).toBeVisible({
    timeout: 30_000,
  });

  const ben = mail.received.find((email) => email.to[0] === 'ben@example.com')?.raw ?? '';
  const dan = mail.received.find((email) => email.to[0] === 'dan@example.com')?.raw ?? '';
  expect(ben).toContain('filename=INV-1001.pdf');
  expect(ben).toContain('filename=brochure.pdf');
  expect(ben).not.toContain('INV-1003.pdf');
  expect(dan).toContain('filename=INV-1003.pdf');
  expect(mail.received.map((email) => email.to[0])).not.toContain('cara@example.com');

  // History keeps the send; its report says what happened to everyone.
  await page.getByRole('link', { name: 'History' }).click();
  await page.getByRole('link', { name: /^Open Payment reminder from / }).click();
  await page.getByRole('button', { name: 'Save a report' }).click();
  await expect(page.getByText('Report saved as report.csv.')).toBeVisible();
  await expectAccessible(page, 'History, with a send');
  const report = readFileSync(reportFile, 'utf8')
    .replace(/^\uFEFF/, '')
    .trim()
    .split('\r\n');
  expect(report[0]).toBe('Row,To,Cc,Bcc,Status,Why,When,Message ID');
  expect(report.find((line) => line.startsWith('2,'))).toContain('ben@example.com,,,Sent');
  expect(report.find((line) => line.startsWith('3,'))).toContain('Left out');

  await app.close();
  await mail.close();
  rmSync(elsewhere, { recursive: true, force: true });
});
