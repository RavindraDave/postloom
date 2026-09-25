import { createRepositories, openDatabase, type OpenedDatabase } from '@postloom/db';
import type { OutgoingEmail, SmtpAccountConfig } from '@postloom/email';
import { STARTER_GALLERY } from '@postloom/editor';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandlers } from './handlers';
import type { IpcHandlers } from './ipc-router';
import { fakeVault } from './test-fakes';

let opened: OpenedDatabase;
let handlers: IpcHandlers;
let repos: ReturnType<typeof createRepositories>;
let picked: { name: string; bytes: Uint8Array } | null;
let send: ReturnType<
  typeof vi.fn<
    (
      config: SmtpAccountConfig,
      email: OutgoingEmail,
    ) => Promise<{ messageId: string; accepted: string[]; rejected: string[] }>
  >
>;

const TODAY = '2026-09-25';
const csv = (text: string) => ({ name: 'invoices.csv', bytes: new TextEncoder().encode(text) });

const LIST = [
  'Email,First Name,Invoice No,Amount,Due Date',
  'asha@example.com,Asha,INV-1,£120,1 Oct',
  'ben@example.com,Ben,INV-2,£80,',
  'not-an-address,Cara,INV-3,£10,3 Oct',
  'Ben@Example.com,Ben,INV-4,£5,4 Oct',
  'dan@example.com,Dan,INV-5,£1,5 Oct',
].join('\n');

beforeEach(async () => {
  picked = csv(LIST);
  opened = await openDatabase({ file: ':memory:' });
  send = vi.fn(() => Promise.resolve({ messageId: '<1@test>', accepted: [], rejected: [] }));
  repos = createRepositories(opened.db);
  handlers = createHandlers({
    appInfo: { name: 'Postloom', version: '0.1.0', platform: 'linux' },
    repos,
    vault: fakeVault(),
    smtp: { verify: () => Promise.resolve(), send },
    pickSpreadsheetFile: () => Promise.resolve(picked),
    todayUtc: () => TODAY,
  });
});
afterEach(async () => {
  await opened.close();
});

async function setUp(dailyLimit?: number) {
  const account = await handlers['accounts:create']({
    name: 'Office',
    provider: 'other',
    host: 'smtp.example.com',
    port: 587,
    security: 'starttls',
    username: 'office@example.com',
    password: 'secret',
    ...(dailyLimit !== undefined && { dailyLimit }),
  });
  const sender = await handlers['senders:create']({
    name: 'Accounts',
    emailAccountId: account.id,
    fromName: 'Asha Kapoor',
    fromAddress: 'office@example.com',
  });
  const reminder = STARTER_GALLERY.find((starter) => starter.id === 'paymentReminder');
  const template = await handlers['templates:create']({
    name: 'Payment reminder',
    subject: 'Invoice {{Invoice No}} is due',
    document: reminder?.document,
  });
  const list = await handlers['recipients:pick'](undefined);
  if (!list) throw new Error('no list');
  const ref = { token: list.token, sheet: list.sheets[0]?.name ?? '', templateId: template.id };
  return { account, sender, template, list, ref };
}

describe('picking a list', () => {
  it('reads the file in the main process and hands back only a token and sheet names', async () => {
    const { list } = await setUp();
    expect(list).toEqual({
      token: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown,
      fileName: 'invoices.csv',
      sheets: [{ name: 'invoices', rowCount: 5 }],
    });
  });

  it('returns null when the person cancels', async () => {
    picked = null;
    expect(await handlers['recipients:pick'](undefined)).toBeNull();
  });

  it('refuses a spreadsheet with nothing in it', async () => {
    picked = csv('\n\n');
    await expect(handlers['recipients:pick'](undefined)).rejects.toMatchObject({
      messageKey: 'errors.spreadsheetEmpty',
    });
  });

  it('asks for the file again once the list has been forgotten', async () => {
    const { ref } = await setUp();
    await expect(
      handlers['recipients:inspect']({ ...ref, token: '00000000-0000-4000-8000-000000000000' }),
    ).rejects.toMatchObject({ messageKey: 'errors.listGone' });
  });
});

describe('matching columns', () => {
  it('guesses the address column and matches details by name', async () => {
    const { ref } = await setUp();
    const inspected = await handlers['recipients:inspect'](ref);
    expect(inspected.headers).toEqual(['Email', 'First Name', 'Invoice No', 'Amount', 'Due Date']);
    expect(inspected.rowCount).toBe(5);
    expect(inspected.sample[0]).toEqual({
      rowNo: 2,
      cells: ['asha@example.com', 'Asha', 'INV-1', '£120', '1 Oct'],
    });
    expect(inspected.mapping).toEqual({
      to: 'Email',
      cc: null,
      bcc: null,
      enabled: null,
      attachments: null,
    });
    expect(inspected.fieldMap).toMatchObject({
      'Invoice No': 'Invoice No',
      Amount: 'Amount',
      'Due Date': 'Due Date',
    });
    // The subject's detail must have a value; it has no "if empty" text.
    expect(inspected.fields).toContainEqual({ name: 'Invoice No', hasFallback: false });
  });

  it('matches only the address columns until a template is chosen', async () => {
    const { ref } = await setUp();
    const inspected = await handlers['recipients:inspect']({ token: ref.token, sheet: ref.sheet });
    expect(inspected.mapping.to).toBe('Email');
    expect(inspected.fields).toEqual([]);
    expect(inspected.fieldMap).toEqual({});
  });

  it('remembers the choices made for a template', async () => {
    const { ref, sender } = await setUp();
    const inspected = await handlers['recipients:inspect'](ref);
    await handlers['recipients:check']({
      ...ref,
      mapping: { ...inspected.mapping, cc: 'First Name' },
      fieldMap: { ...inspected.fieldMap, Amount: 'Invoice No' },
      senderId: sender.id,
      skipRows: [],
      sendDuplicatesOnce: false,
    });
    const again = await handlers['recipients:inspect'](ref);
    expect(again.mapping.cc).toBe('First Name');
    expect(again.fieldMap['Amount']).toBe('Invoice No');
  });
});

describe('checking everyone', () => {
  async function check(options: { skipRows?: number[]; dailyLimit?: number } = {}) {
    const { ref, sender, account } = await setUp(options.dailyLimit);
    const { mapping, fieldMap } = await handlers['recipients:inspect'](ref);
    const run = () =>
      handlers['recipients:check']({
        ...ref,
        mapping,
        fieldMap,
        senderId: sender.id,
        skipRows: options.skipRows ?? [],
        sendDuplicatesOnce: false,
      });
    return { run, account };
  }

  it('finds bad addresses, empty details and repeated addresses', async () => {
    const { run } = await check();
    const result = await run();
    const byId = Object.fromEntries(result.problems.map((p) => [p.id, p]));
    expect(byId['invalidAddress']).toMatchObject({ severity: 'mustFix', rows: [4] });
    expect(byId['emptyDetail']?.rows).toEqual([3]);
    // The later row repeats Ben's address (addresses match ignoring case).
    expect(byId['duplicate']?.rows).toEqual([5]);
  });

  it('leaves out skipped rows and people on the "Do not email" list', async () => {
    await repos.suppression.add('dan@example.com', 'unsubscribed');
    const { run } = await check({ skipRows: [4] });
    const result = await run();
    expect(result.toSendRows).toEqual([2, 3, 5]);
    expect(result.leftOut).toEqual({ skipped: 1, disabled: 0, doNotEmail: 1, duplicate: 0 });
    expect(result.problems.find((p) => p.id === 'invalidAddress')).toBeUndefined();
  });

  it('counts what was already sent today against the daily limit', async () => {
    const { run, account } = await check({ skipRows: [4], dailyLimit: 5 });
    await repos.usage.add(account.id, TODAY, 3);
    const result = await run();
    expect(result).toMatchObject({ dailyLimit: 5, remainingToday: 2 });
    expect(result.problems.find((p) => p.id === 'overDailyLimit')?.severity).toBe('mustFix');
  });

  it('gives one person’s addresses and details for the preview', async () => {
    const { ref } = await setUp();
    const { mapping, fieldMap } = await handlers['recipients:inspect'](ref);
    const row = await handlers['recipients:row']({ ...ref, mapping, fieldMap, rowNo: 2 });
    expect(row).toMatchObject({
      rowNo: 2,
      to: ['asha@example.com'],
      values: { 'First Name': 'Asha', 'Invoice No': 'INV-1' },
    });
    await expect(
      handlers['recipients:row']({ ...ref, mapping, fieldMap, rowNo: 99 }),
    ).rejects.toMatchObject({ messageKey: 'errors.rowNotFound' });
  });
});

describe('a test with one person’s details', () => {
  it('fills in the real details instead of placeholders', async () => {
    const { sender, template } = await setUp();
    await handlers['templates:sendTest']({
      id: template.id,
      senderId: sender.id,
      values: { 'First Name': 'Asha', 'Invoice No': 'INV-1', Amount: '£120', 'Due Date': '1 Oct' },
    });
    const email = send.mock.calls[0]?.[1];
    expect(email?.subject).toBe('[Test] Invoice INV-1 is due');
    expect(email?.html).toContain('INV-1');
    expect(email?.html).toContain('£120');
    expect(email?.html).not.toContain('[Invoice No]');
  });
});
