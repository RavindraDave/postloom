import type { Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, firstPage, launchApp, test } from './fixtures';
import { startTestMailServer, type TestMailServer } from './mail-server';

const ADDRESS = 'asha@example.com';
const PASSWORD = 'abcd efgh ijkl mnop';

const LIST = [
  'Email,First Name,Invoice No,Amount,Due Date',
  'p1@example.com,Pia,INV-1,£1,1 Oct',
  'p2@example.com,Raj,INV-2,£2,2 Oct',
  'p3@example.com,Sam,INV-3,£3,3 Oct',
  'nobody@example.com,Nobody,INV-4,£4,4 Oct',
  'p5@example.com,Tia,INV-5,£5,5 Oct',
].join('\n');

async function connectAndMakeTemplate(page: Page, mail: TestMailServer) {
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
}

async function startSend(page: Page) {
  await page.getByRole('link', { name: 'Send emails' }).click();
  await page.getByRole('button', { name: 'Choose a file…' }).click();
  await expect(page.getByText('5 people on this list')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('combobox', { name: 'Template' }).click();
  await page.getByRole('option', { name: 'Payment reminder' }).click();
  await expect(page.getByRole('combobox', { name: 'Invoice No' })).toHaveValue('Invoice No');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('5 emails will be sent from Asha Kapoor.')).toBeVisible();
  await page.getByRole('button', { name: 'Continue without a test' }).click();
  await page.getByRole('button', { name: 'Continue' }).first().click();
  await page.getByRole('button', { name: 'Send now' }).click();
}

/**
 * Kills the app the way a crash or power cut would. On Windows, killing only
 * the main process leaves its child processes running, so the whole tree goes.
 */
function killApp(pid: number | undefined) {
  if (pid === undefined) throw new Error('The app has no process id');
  if (process.platform === 'win32') {
    execFileSync('taskkill', ['/PID', String(pid), '/T', '/F']);
  } else {
    process.kill(pid, 'SIGKILL');
  }
}

const receivedBy = (mail: TestMailServer) => mail.received.map((email) => email.to[0]);

test('pauses and carries on, survives being killed mid-email, and never sends twice', async ({
  userDataDir,
}) => {
  const mail = await startTestMailServer(
    { username: ADDRESS, password: PASSWORD },
    { acceptDelayMs: 1_500, rejectRecipients: ['nobody@example.com'] },
  );
  const caFile = join(userDataDir, 'test-ca.pem');
  writeFileSync(caFile, mail.caPem);
  const listFile = join(userDataDir, 'invoices.csv');
  writeFileSync(listFile, LIST);
  const env = { POSTLOOM_TEST_EXTRA_CA_FILE: caFile, POSTLOOM_TEST_PICK_SPREADSHEET: listFile };

  let app = await launchApp(userDataDir, env);
  let page = await firstPage(app);
  await connectAndMakeTemplate(page, mail);
  await startSend(page);

  // Live progress; pause after the first email.
  await expect(page.getByText(/^Sending… \d of 5$/)).toBeVisible();
  await expect(page.getByTestId('count-sent')).toHaveText('1', { timeout: 20_000 });
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByText('Paused. Nothing more is sent until you carry on.')).toBeVisible({
    timeout: 20_000,
  });
  const whilePaused = mail.received.length;
  await page.waitForTimeout(3_000);
  expect(mail.received.length).toBe(whilePaused);

  // Carry on, then kill the app once the server has the third email but
  // hasn't said "accepted" yet: the app can't know whether it went.
  await page.getByRole('button', { name: 'Carry on sending' }).click();
  await expect.poll(() => mail.received.length, { timeout: 20_000 }).toBe(3);
  killApp(app.process().pid);
  // The sending process died with the app: nothing more arrives.
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  expect(mail.received.length).toBe(3);

  // Back again: the interrupted send is waiting, and asks about the uncertain email.
  app = await launchApp(userDataDir, env);
  page = await firstPage(app);
  await page.getByRole('link', { name: 'Send emails' }).click();
  await expect(page.getByText("A send isn't finished")).toBeVisible();
  await page.getByRole('link', { name: 'Open' }).click();
  await expect(page.getByText(/Postloom closed while sending/)).toBeVisible();
  await expect(page.getByText('1 email may or may not have been sent')).toBeVisible();
  await expect(page.getByRole('table', { name: 'People not emailed' })).toContainText(
    'p3@example.com',
  );
  // The server did get it, so skip it rather than send it twice.
  await page.getByRole('button', { name: 'Skip them' }).click();
  await expect(page.getByText('1 email may or may not have been sent')).toBeHidden();

  await page.getByRole('button', { name: 'Carry on sending' }).click();
  await expect(page.getByText(/^Done! \d emails? sent\.$/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('count-failed')).toHaveText('1');
  await expect(page.getByRole('table', { name: 'People not emailed' })).toContainText(
    'the address may not exist',
  );

  // Everyone got exactly one email; the refused address got none.
  const everyone = receivedBy(mail);
  expect(everyone.sort()).toEqual([
    'p1@example.com',
    'p2@example.com',
    'p3@example.com',
    'p5@example.com',
  ]);
  const personal = mail.received.find((email) => email.to[0] === 'p5@example.com');
  expect(personal?.raw).toContain('INV-5');

  await app.close();
  await mail.close();
});
