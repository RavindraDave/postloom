import { createRepositories, openDatabase, type OpenedDatabase } from '@postloom/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyHistoryRetention, createDataHandlers, type DataStore } from './data';

let opened: OpenedDatabase;
let repos: ReturnType<typeof createRepositories>;
let clock = new Date('2026-01-01T09:00:00.000Z');

beforeEach(async () => {
  opened = await openDatabase({ file: ':memory:' });
  let n = 0;
  repos = createRepositories(opened.db, { now: () => clock, newId: () => `id-${String(++n)}` });
});
afterEach(async () => {
  await opened.close();
});

async function sendOn(iso: string, status: 'finished' | 'stopped' | 'paused') {
  clock = new Date(iso);
  const account = await repos.accounts.create({
    name: 'Office',
    provider: 'other',
    host: 'smtp.example.com',
    port: 587,
    security: 'starttls',
    username: 'a@example.com',
    dailyLimit: null,
    delayMs: null,
  });
  const sender = await repos.senders.create({
    name: 'A',
    emailAccountId: account.id,
    fromName: 'A',
    fromAddress: 'a@example.com',
    replyTo: null,
    defaultCc: null,
    defaultBcc: null,
    brandKitId: null,
    delayMs: null,
  });
  const template = await repos.templates.create({
    name: 'T',
    subject: 'S',
    category: null,
    editorMode: 'write',
    document: { type: 'doc', content: [] },
    documentVersion: 1,
    defaultSenderProfileId: null,
  });
  const version = await repos.templates.snapshot(template.id, 'Sent');
  const send = await repos.sends.create({
    templateId: template.id,
    templateVersionId: version.id,
    senderProfileId: sender.id,
    emailAccountId: account.id,
    settings: { delayMs: 0, dailyLimit: 10 },
    sourceFileName: 'list.csv',
    sourceFileSha256: 'x',
    mapping: {},
    recipients: [{ rowNo: 2, to: ['p@example.com'], cc: [], bcc: [], values: {} }],
  });
  await repos.sends.setStatus(send.id, status);
  return send.id;
}

const backups = [
  {
    fileName: 'postloom-manual-2026.sqlite',
    kind: 'manual',
    createdAt: new Date('2026-09-25T10:00:00.000Z'),
    sizeBytes: 2048,
  },
];

function fakeStore(): DataStore {
  return {
    list: () => backups,
    backupNow: () => 'postloom-manual-2026.sqlite',
    restoreOnRestart: vi.fn(),
    openFolder: vi.fn(() => Promise.resolve()),
  };
}

describe('history retention', () => {
  it('removes finished and stopped sends older than the setting, never unfinished ones', async () => {
    const old = await sendOn('2026-01-01T09:00:00.000Z', 'finished');
    const oldStopped = await sendOn('2026-01-02T09:00:00.000Z', 'stopped');
    const oldPaused = await sendOn('2026-01-03T09:00:00.000Z', 'paused');
    const recent = await sendOn('2026-09-20T09:00:00.000Z', 'finished');

    expect(await applyHistoryRetention(repos, 0, new Date('2026-09-25'))).toBe(0);
    expect(await applyHistoryRetention(repos, 30, new Date('2026-09-25'))).toBe(2);
    const left = (await repos.sends.list()).map((send) => send.id);
    expect(left).toEqual(expect.arrayContaining([oldPaused, recent]));
    expect(left).not.toContain(old);
    expect(left).not.toContain(oldStopped);
    // Their people went with them.
    expect(await repos.sends.recipients(old)).toEqual([]);
  });
});

describe('your data', () => {
  it('lists backups and takes one now', async () => {
    const handlers = createDataHandlers({ repos, store: fakeStore(), isSending: () => false });
    expect(await handlers['data:backups'](undefined)).toEqual([
      {
        fileName: 'postloom-manual-2026.sqlite',
        kind: 'manual',
        createdAt: '2026-09-25T10:00:00.000Z',
        sizeBytes: 2048,
      },
    ]);
    expect((await handlers['data:backupNow'](undefined)).kind).toBe('manual');
  });

  it('restores only a backup from the list, and never while sending', async () => {
    const store = fakeStore();
    let sending = true;
    const handlers = createDataHandlers({ repos, store, isSending: () => sending });
    await expect(
      handlers['data:restore']({ fileName: 'postloom-manual-2026.sqlite' }),
    ).rejects.toMatchObject({ messageKey: 'errors.restoreWhileSending' });
    sending = false;
    await expect(handlers['data:restore']({ fileName: '../secret.sqlite' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(store.restoreOnRestart).not.toHaveBeenCalled();
    await handlers['data:restore']({ fileName: 'postloom-manual-2026.sqlite' });
    expect(store.restoreOnRestart).toHaveBeenCalledWith('postloom-manual-2026.sqlite');
  });

  it('opens the data folder and clears finished history', async () => {
    const store = fakeStore();
    const handlers = createDataHandlers({ repos, store, isSending: () => false });
    await handlers['data:openFolder'](undefined);
    expect(store.openFolder).toHaveBeenCalled();
    await sendOn('2026-09-20T09:00:00.000Z', 'finished');
    const paused = await sendOn('2026-09-21T09:00:00.000Z', 'paused');
    expect(await handlers['data:clearHistory'](undefined)).toEqual({ deleted: 1 });
    expect((await repos.sends.list()).map((send) => send.id)).toEqual([paused]);
  });
});
