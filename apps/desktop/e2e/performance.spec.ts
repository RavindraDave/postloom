import type { ElectronApplication, Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeXlsx } from '../../../packages/recipients/src/test-helpers';
import { expect, firstPage, launchApp, test } from './fixtures';
import { startTestMailServer } from './mail-server';

/**
 * PLAN.md §15.3. Each budget is checked as the person would feel it, in the
 * built app. Timings are printed, so a slow drift shows before a budget breaks.
 */
const BUDGET = {
  coldStartMs: 3000,
  navigationMs: 150,
  openTemplateMs: 1000,
  // Rendering the preview, after the 400 ms pause it waits for typing to stop.
  previewMs: 300,
  previewPauseMs: 400,
  importTenThousandMs: 5000,
  // "The screen stays responsive": no single task blocks it for longer.
  longestTaskMs: 250,
  // What sending adds to the app at rest (Electron's own processes are most of
  // the rest: about 600 MB on a CI machine with no graphics card).
  sendingAddsMb: 300,
  // "Flat": what the sending process may grow by between 1,000 and 4,900 emails.
  // This is memory the process holds, which grows before the engine tidies up;
  // memory.test.ts in @postloom/sending shows memory actually in use stays flat.
  sendGrowthMb: 50,
} as const;

const report = (name: string, value: number, budget: number, unit = 'ms') => {
  process.stdout.write(
    `[perf] ${name}: ${value.toFixed(0)} ${unit} (budget ${String(budget)} ${unit})\n`,
  );
};

/** Clicks a sidebar link and waits, in the page, until the new page's heading is painted. */
async function navigationTime(page: Page, link: string, heading: string): Promise<number> {
  return page.evaluate(
    async ({ link, heading }) => {
      const anchor = [...document.querySelectorAll('nav a')].find(
        (element) => element.textContent.trim() === link,
      );
      if (!(anchor instanceof HTMLElement)) throw new Error(`No link ${link}`);
      const start = performance.now();
      anchor.click();
      await new Promise<void>((resolve) => {
        const check = () => {
          if (document.querySelector('h1')?.textContent.includes(heading)) resolve();
          else requestAnimationFrame(check);
        };
        check();
      });
      return performance.now() - start;
    },
    { link, heading },
  );
}

/** Starts collecting tasks that block the screen for 50 ms or more. */
async function watchLongTasks(page: Page) {
  await page.evaluate(() => {
    const tasks: number[] = [];
    (window as unknown as { longTasks: number[] }).longTasks = tasks;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) tasks.push(entry.duration);
    }).observe({ type: 'longtask', buffered: false });
  });
}

const longestTask = (page: Page) =>
  page.evaluate(() => Math.max(0, ...(window as unknown as { longTasks: number[] }).longTasks));

/** Memory in use by each of Postloom's processes, in MB. */
async function memory(app: ElectronApplication) {
  const metrics = await app.evaluate(({ app: electronApp }) =>
    electronApp.getAppMetrics().map((metric) => ({
      type: metric.type,
      name: metric.name ?? '',
      mb: metric.memory.workingSetSize / 1024,
    })),
  );
  if (process.env['POSTLOOM_PERF_DEBUG']) {
    process.stdout.write(
      `${metrics.map((m) => `${m.name || m.type}=${m.mb.toFixed(0)}`).join(' ')}\n`,
    );
  }
  return {
    total: metrics.reduce((sum, metric) => sum + metric.mb, 0),
    sending: metrics.find((metric) => metric.name === 'Postloom sending')?.mb ?? 0,
  };
}

test('starts quickly, and moves between screens without waiting', async ({ userDataDir }) => {
  const started = Date.now();
  const app = await launchApp(userDataDir);
  const page = await firstPage(app);
  await expect(page.getByRole('heading', { name: 'Welcome to Postloom' })).toBeVisible();
  const coldStart = Date.now() - started;
  report('cold start to interactive', coldStart, BUDGET.coldStartMs);
  expect(coldStart).toBeLessThan(BUDGET.coldStartMs);

  // Each screen once to warm up, then measured.
  const screens: [string, string][] = [
    ['Templates', 'Templates'],
    ['History', 'History'],
    ['Settings', 'Settings'],
    ['Senders & accounts', 'Senders & accounts'],
    ['Home', 'Welcome to Postloom'],
  ];
  for (const [link, heading] of screens) await navigationTime(page, link, heading);
  const times: number[] = [];
  for (const [link, heading] of screens) times.push(await navigationTime(page, link, heading));
  const slowest = Math.max(...times);
  report('navigation (slowest screen)', slowest, BUDGET.navigationMs);
  expect(slowest).toBeLessThan(BUDGET.navigationMs);
  await app.close();
});

test('opens a template, and the preview keeps up with typing', async ({ userDataDir }) => {
  const app = await launchApp(userDataDir);
  const page = await firstPage(app);
  const id = await page.evaluate(async () => {
    const created = await window.postloom.templates.create({ name: 'Newsletter', subject: 'Hi' });
    if (!created.ok) throw new Error('Could not make a template');
    return created.data.id;
  });
  // Warm up the editor once, as a person would already have opened Templates.
  await page.getByRole('link', { name: 'Templates' }).click();
  await expect(page.getByRole('heading', { name: 'Templates', level: 1 })).toBeVisible();

  const opened = await page.evaluate(async (templateId) => {
    const start = performance.now();
    window.location.hash = `#/templates/${templateId}`;
    await new Promise<void>((resolve) => {
      const check = () => {
        if (document.querySelector('[contenteditable="true"]')) resolve();
        else requestAnimationFrame(check);
      };
      check();
    });
    return performance.now() - start;
  }, id);
  report('open a template in the editor', opened, BUDGET.openTemplateMs);
  expect(opened).toBeLessThan(BUDGET.openTemplateMs);

  await page.getByRole('textbox', { name: 'Email text' }).click();
  await page.keyboard.type('Quarterly');
  // Past the pause the preview waits for typing to stop, so only the rendering is timed.
  await page.waitForTimeout(BUDGET.previewPauseMs + 100);
  const clicked = Date.now();
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.locator('iframe[title="Email preview"]')).toHaveAttribute(
    'srcdoc',
    /Quarterly/,
  );
  const afterPause = Date.now() - clicked;
  report('preview of the letter', afterPause, BUDGET.previewMs);
  expect(afterPause).toBeLessThan(BUDGET.previewMs);
  await app.close();
});

test('reads a 10,000-row spreadsheet quickly, and the screen stays responsive', async ({
  userDataDir,
}) => {
  const rows = Array.from({ length: 10_000 }, (_, i) => [
    `person${String(i)}@example.com`,
    `Person ${String(i)}`,
    `INV-${String(i)}`,
    i * 1.5,
  ]);
  const listFile = join(userDataDir, 'big-list.xlsx');
  writeFileSync(
    listFile,
    makeXlsx([
      { name: 'Customers', rows: [['Email', 'First Name', 'Invoice No', 'Amount'], ...rows] },
    ]),
  );
  const app = await launchApp(userDataDir, { POSTLOOM_TEST_PICK_SPREADSHEET: listFile });
  const page = await firstPage(app);
  await page.getByRole('link', { name: 'Send emails' }).click();
  await watchLongTasks(page);

  const started = Date.now();
  await page.getByRole('button', { name: 'Choose a file…' }).click();
  await expect(page.getByText(/^10,?000 people on this list$/)).toBeVisible({ timeout: 30_000 });
  const took = Date.now() - started;
  report('read a 10,000-row spreadsheet', took, BUDGET.importTenThousandMs);
  const blocked = await longestTask(page);
  report('longest blocked screen while reading', blocked, BUDGET.longestTaskMs);
  expect(took).toBeLessThan(BUDGET.importTenThousandMs);
  expect(blocked).toBeLessThan(BUDGET.longestTaskMs);
  await app.close();
});

test('memory stays flat while sending to 5,000 people', async ({ userDataDir }) => {
  const address = 'asha@example.com';
  const password = 'abcd efgh ijkl mnop';
  const mail = await startTestMailServer({ username: address, password });
  const caFile = join(userDataDir, 'test-ca.pem');
  writeFileSync(caFile, mail.caPem);
  const listFile = join(userDataDir, 'five-thousand.csv');
  writeFileSync(
    listFile,
    [
      'Email,First Name',
      ...Array.from({ length: 5000 }, (_, i) => `p${String(i)}@example.com,Person ${String(i)}`),
    ].join('\n'),
  );
  const app = await launchApp(userDataDir, {
    POSTLOOM_TEST_EXTRA_CA_FILE: caFile,
    POSTLOOM_TEST_PICK_SPREADSHEET: listFile,
  });
  const page = await firstPage(app);
  // Set up through the app's own API: this test is about sending, not setting up.
  await page.evaluate(
    async ({ port, address, password }) => {
      const api = window.postloom;
      const account = await api.accounts.create({
        name: 'Test server',
        provider: 'other',
        host: 'localhost',
        port,
        security: 'starttls',
        username: address,
        password,
        dailyLimit: 10_000,
      });
      if (!account.ok) throw new Error('Could not add the account');
      const sender = await api.senders.create({
        name: 'Asha',
        emailAccountId: account.data.id,
        fromName: 'Asha Kapoor',
        fromAddress: address,
        delayMs: 0,
      });
      if (!sender.ok) throw new Error('Could not add the sender');
      await api.templates.create({ name: 'Note', subject: 'Hello' });
      await api.settings.update({ confirmBeforeSend: false, dailyLimit: 10_000 });
    },
    { port: mail.port, address, password },
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome to Postloom' })).toBeVisible();
  await page.waitForTimeout(2000);
  const atRest = (await memory(app)).total;
  process.stdout.write(`[perf] memory, the app at rest: ${atRest.toFixed(0)} MB (for reference)\n`);

  await page.getByRole('link', { name: 'Send emails' }).click();
  await page.getByRole('button', { name: 'Choose a file…' }).click();
  await expect(page.getByText(/^5,?000 people on this list$/)).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('combobox', { name: 'Template' }).click();
  await page.getByRole('option', { name: 'Note' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue without a test' }).click();
  await page.getByRole('button', { name: 'Continue' }).first().click();
  await page.getByRole('button', { name: 'Send now' }).click();

  const sent = page.getByTestId('count-sent');
  const sentSoFar = async () => Number((await sent.textContent())?.replace(/\D/g, '') ?? 0);
  await expect
    .poll(sentSoFar, { timeout: 5 * 60_000, intervals: [1000] })
    .toBeGreaterThanOrEqual(1000);
  const early = await memory(app);
  // The last reading while the sending process is still there.
  let late = early;
  let peak = early.total;
  while ((await sentSoFar()) < 4900) {
    await page.waitForTimeout(1000);
    const now = await memory(app);
    if (now.sending > 0) late = now;
    peak = Math.max(peak, now.total);
  }
  await expect(
    page.getByRole('status').filter({ hasText: /^Done! 5,?000 emails sent\.$/ }),
  ).toBeVisible({
    timeout: 5 * 60_000,
  });
  const growth = late.sending - early.sending;
  report('memory sending adds to the app at rest', peak - atRest, BUDGET.sendingAddsMb, 'MB');
  report('sending process growth, 1,000 → 4,900 emails', growth, BUDGET.sendGrowthMb, 'MB');
  expect(mail.received).toHaveLength(5000);
  expect(early.sending).toBeGreaterThan(0);
  expect(peak - atRest).toBeLessThan(BUDGET.sendingAddsMb);
  expect(growth).toBeLessThan(BUDGET.sendGrowthMb);
  await app.close();
  await mail.close();
});
