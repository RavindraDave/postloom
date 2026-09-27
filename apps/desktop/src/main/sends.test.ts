import { createRepositories, openDatabase, type OpenedDatabase } from '@postloom/db';
import { SendFailure, type Mailer, type OutgoingEmail } from '@postloom/email';
import { STARTER_GALLERY } from '@postloom/editor';
import type { Outcome } from '@postloom/sending';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandlers } from './handlers';
import type { IpcHandlers } from './ipc-router';
import { createProcessRunner, type ChildProcessLike, type FromSender } from './send-runner';
import { fakeVault } from './test-fakes';

let opened: OpenedDatabase;
let handlers: IpcHandlers;
let repos: ReturnType<typeof createRepositories>;
let delivered: OutgoingEmail[];
let respond: (email: OutgoingEmail) => Error | null;
let listText: string;
let listFolder: string;
let saved: { name: string; csv: string } | null;
const notify = vi.fn();

const LIST = [
  'Email,First Name,Invoice No,Amount,Due Date',
  'asha@example.com,Asha,INV-1,£120,1 Oct',
  'ben@example.com,Ben,INV-2,£80,2 Oct',
  'cara@example.com,Cara,INV-3,£10,3 Oct',
].join('\n');

beforeEach(async () => {
  opened = await openDatabase({ file: ':memory:' });
  repos = createRepositories(opened.db);
  delivered = [];
  respond = () => null;
  listText = LIST;
  saved = null;
  listFolder = mkdtempSync(join(tmpdir(), 'postloom-list-'));
  notify.mockReset();
  const mailer: Mailer = {
    send: (email) => {
      const error = respond(email);
      if (error) return Promise.reject(error);
      delivered.push(email);
      return Promise.resolve({
        messageId: `<${String(delivered.length)}@test>`,
        accepted: [],
        rejected: [],
      });
    },
    close: () => undefined,
  };
  handlers = createHandlers({
    appInfo: { name: 'Postloom', version: '0.1.0', platform: 'linux' },
    repos,
    vault: fakeVault(),
    smtp: { verify: () => Promise.resolve(), send: () => Promise.reject(new Error('unused')) },
    pickSpreadsheetFile: () =>
      Promise.resolve({
        name: 'invoices.csv',
        bytes: new TextEncoder().encode(listText),
        folder: listFolder,
      }),
    openMailer: () => mailer,
    notify,
    saveFile: (name, csv) => {
      saved = { name, csv };
      return Promise.resolve(name);
    },
  });
});
afterEach(async () => {
  // Let any send still winding down finish before the database closes.
  await vi.waitFor(async () => {
    for (const send of await handlers['sends:list'](undefined)) expect(send.running).toBe(false);
  });
  await opened.close();
  rmSync(listFolder, { recursive: true, force: true });
});

async function setUp(delayMs = 0) {
  const account = await handlers['accounts:create']({
    name: 'Office',
    provider: 'other',
    host: 'smtp.example.com',
    port: 587,
    security: 'starttls',
    username: 'office@example.com',
    password: 'app password',
  });
  const sender = await handlers['senders:create']({
    name: 'Accounts',
    emailAccountId: account.id,
    fromName: 'Asha Kapoor',
    fromAddress: 'office@example.com',
    delayMs,
  });
  const reminder = STARTER_GALLERY.find((starter) => starter.id === 'paymentReminder');
  const template = await handlers['templates:create']({
    name: 'Payment reminder',
    subject: 'Invoice {{Invoice No}}',
    document: reminder?.document,
  });
  const list = await handlers['recipients:pick'](undefined);
  const ref = { token: list!.token, sheet: 'invoices', templateId: template.id };
  const { mapping, fieldMap } = await handlers['recipients:inspect'](ref);
  const input = {
    ...ref,
    mapping,
    fieldMap,
    senderId: sender.id,
    skipRows: [] as number[],
    sendDuplicatesOnce: false,
  };
  return { account, sender, template, input };
}

const until = async (
  id: string,
  check: (s: Awaited<ReturnType<IpcHandlers['sends:get']>>) => boolean,
) =>
  vi.waitFor(async () => {
    const summary = await handlers['sends:get']({ id });
    expect(check(summary)).toBe(true);
    return summary;
  });

describe('sending', () => {
  it('sends everyone their own email, then says it’s finished', async () => {
    const { input } = await setUp();
    const started = await handlers['sends:start'](input);
    expect(started).toMatchObject({
      templateName: 'Payment reminder',
      senderName: 'Accounts',
      accountName: 'Office',
      fileName: 'invoices.csv',
    });

    const done = await until(started.id, (s) => s.status === 'finished' && !s.running);
    expect(done.counts).toMatchObject({ sent: 3, pending: 0, failed: 0 });
    expect(delivered.map((e) => [e.to[0], e.subject])).toEqual([
      ['asha@example.com', 'Invoice INV-1'],
      ['ben@example.com', 'Invoice INV-2'],
      ['cara@example.com', 'Invoice INV-3'],
    ]);
    expect(delivered[1]?.html).toContain('INV-2');
    expect(delivered[1]?.from).toEqual({ name: 'Asha Kapoor', address: 'office@example.com' });
    expect(notify).toHaveBeenCalledWith('Sending finished', 'All 3 emails were sent.');

    // The send kept the template as it was, even if it's edited later.
    const send = await repos.sends.get(started.id);
    expect((await repos.templates.version(send.templateVersionId)).subject).toBe(
      'Invoice {{Invoice No}}',
    );
    expect(await handlers['sends:list'](undefined)).toHaveLength(1);
  });

  it('keeps people left out in the report, and never emails them', async () => {
    await repos.suppression.add('ben@example.com', 'unsubscribed');
    const { input } = await setUp();
    const started = await handlers['sends:start']({ ...input, skipRows: [4] });
    await until(started.id, (s) => s.status === 'finished' && !s.running);
    expect(delivered.map((e) => e.to[0])).toEqual(['asha@example.com']);
    expect(await handlers['sends:problems']({ id: started.id })).toEqual([
      { rowNo: 3, to: 'ben@example.com', status: 'skipped', errorCode: 'doNotEmail' },
      { rowNo: 4, to: 'cara@example.com', status: 'skipped', errorCode: 'skipped' },
    ]);
  });

  it('shows what was typed for a left-out row with a bad address', async () => {
    listText = `${LIST}\nnot an address,Dan,INV-4,£1,4 Oct`;
    const { input } = await setUp();
    const started = await handlers['sends:start']({ ...input, skipRows: [5] });
    await until(started.id, (s) => s.status === 'finished' && !s.running);
    expect(await handlers['sends:problems']({ id: started.id })).toEqual([
      { rowNo: 5, to: 'not an address', status: 'skipped', errorCode: 'skipped' },
    ]);
  });

  it('saves a report of everyone, with what happened and why', async () => {
    const { input } = await setUp();
    respond = (email) =>
      email.to[0] === 'ben@example.com' ? new SendFailure('rejected', '550') : null;
    const started = await handlers['sends:start']({ ...input, skipRows: [4] });
    await until(started.id, (s) => s.status === 'finished' && !s.running);

    expect(await handlers['sends:exportReport']({ id: started.id })).toEqual({
      saved: true,
      fileName: expect.stringMatching(/^Payment reminder \d{4}-\d{2}-\d{2}\.csv$/) as unknown,
    });
    const lines = saved?.csv.trim().split('\r\n') ?? [];
    expect(lines).toHaveLength(4);
    expect(lines[1]).toMatch(/^2,asha@example.com,,,Sent,,/);
    expect(lines[2]).toContain("Couldn't send");
    expect(lines[2]).toContain('(550)');
    expect(lines[3]).toContain('Left out');
  });

  it('refuses to start while there are problems to fix', async () => {
    const { input } = await setUp();
    await expect(
      handlers['sends:start']({ ...input, fieldMap: { ...input.fieldMap, 'Invoice No': null } }),
    ).rejects.toMatchObject({ messageKey: 'errors.sendHasProblems' });
    await expect(handlers['sends:start']({ ...input, skipRows: [2, 3, 4] })).rejects.toMatchObject({
      messageKey: 'errors.sendNobody',
    });
    expect(await handlers['sends:list'](undefined)).toEqual([]);
  });

  it('pauses after the current email, resumes, and stops', async () => {
    const { input } = await setUp(60_000);
    const started = await handlers['sends:start'](input);
    await until(started.id, (s) => s.counts.sent === 1);
    await handlers['sends:pause']({ id: started.id });
    const paused = await until(started.id, (s) => s.status === 'paused' && !s.running);
    expect(paused).toMatchObject({ pauseReason: 'user', counts: { sent: 1, pending: 2 } });

    await handlers['sends:resume']({ id: started.id });
    await until(started.id, (s) => s.counts.sent === 2);
    await handlers['sends:stop']({ id: started.id });
    const stopped = await until(started.id, (s) => s.status === 'stopped' && !s.running);
    expect(stopped.counts).toMatchObject({ sent: 2, pending: 1 });
    expect(delivered).toHaveLength(2);
  });

  it('retries failed people when asked', async () => {
    const { input } = await setUp();
    respond = (email) =>
      email.to[0] === 'ben@example.com' ? new SendFailure('rejected', '550') : null;
    const started = await handlers['sends:start'](input);
    const done = await until(started.id, (s) => s.status === 'finished' && !s.running);
    expect(done.counts).toMatchObject({ sent: 2, failed: 1 });
    expect(notify).toHaveBeenCalledWith('Sending finished', "2 sent. 1 couldn't be sent.");
    expect(await handlers['sends:problems']({ id: started.id })).toEqual([
      { rowNo: 3, to: 'ben@example.com', status: 'failed', errorCode: 'rejected:550' },
    ]);

    respond = () => null;
    await handlers['sends:retryFailed']({ id: started.id });
    const again = await until(started.id, (s) => s.status === 'finished' && !s.running);
    expect(again.counts).toMatchObject({ sent: 3, failed: 0 });
  });

  it('pauses when the password stops working, and tells the person', async () => {
    const { input } = await setUp();
    respond = () => new SendFailure('auth', '535');
    const started = await handlers['sends:start'](input);
    const paused = await until(started.id, (s) => s.status === 'paused' && !s.running);
    expect(paused).toMatchObject({ pauseReason: 'auth', counts: { pending: 3 } });
    expect(notify).toHaveBeenCalledWith('Sending paused', 'Open Postloom to see why and carry on.');
  });

  it('asks about emails that may have gone out, and finishes once they’re skipped', async () => {
    const { input } = await setUp();
    respond = (email) =>
      email.to[0] === 'cara@example.com' ? new SendFailure('uncertain', 'ETIMEDOUT') : null;
    const started = await handlers['sends:start'](input);
    const done = await until(started.id, (s) => s.status === 'finished' && !s.running);
    expect(done.counts).toMatchObject({ sent: 2, uncertain: 1 });

    await handlers['sends:resolveUncertain']({ id: started.id, action: 'skip' });
    expect((await handlers['sends:get']({ id: started.id })).counts).toMatchObject({
      uncertain: 0,
      skipped: 1,
    });
  });

  it('sends the uncertain ones again only when the person says so', async () => {
    const { input } = await setUp();
    const started = await handlers['sends:start'](input);
    await until(started.id, (s) => s.status === 'finished' && !s.running);
    // Pretend the app crashed while emailing Asha.
    const [asha] = await repos.sends.recipients(started.id);
    await opened.db
      .updateTable('send_recipients')
      .set({ status: 'uncertain', error_code: 'interrupted' })
      .where('id', '=', asha!.id)
      .execute();
    await repos.sends.setStatus(started.id, 'paused', 'interrupted');

    await handlers['sends:resolveUncertain']({ id: started.id, action: 'resend' });
    await handlers['sends:resume']({ id: started.id });
    const done = await until(started.id, (s) => s.status === 'finished' && !s.running);
    expect(done.counts.sent).toBe(3);
    expect(delivered.filter((e) => e.to[0] === asha!.to[0])).toHaveLength(2);
  });

  it('allows one running send per email account', async () => {
    const { input } = await setUp(60_000);
    const first = await handlers['sends:start'](input);
    await until(first.id, (s) => s.counts.sent === 1);
    await expect(handlers['sends:start'](input)).rejects.toMatchObject({
      messageKey: 'errors.sendAccountBusy',
    });
    await handlers['sends:stop']({ id: first.id });
  });
});

describe('attachments', () => {
  it('checks each file before sending, and attaches them', async () => {
    const elsewhere = mkdtempSync(join(tmpdir(), 'postloom-elsewhere-'));
    mkdirSync(join(listFolder, 'invoices'));
    writeFileSync(join(listFolder, 'invoices', 'INV-1.pdf'), '%PDF asha');
    writeFileSync(join(elsewhere, 'brochure.pdf'), '%PDF brochure');
    listText = [
      'Email,First Name,Invoice No,Amount,Due Date,Attachment',
      `asha@example.com,Asha,INV-1,£120,1 Oct,invoices/INV-1.pdf`,
      `ben@example.com,Ben,INV-2,£80,2 Oct,${join(elsewhere, 'brochure.pdf')}`,
      'cara@example.com,Cara,INV-3,£10,3 Oct,invoices/missing.pdf',
    ].join('\n');
    const { input } = await setUp();
    expect(input.mapping.attachments).toBe('Attachment');

    const check = await handlers['recipients:check'](input);
    const byId = Object.fromEntries(check.problems.map((p) => [p.id, p]));
    expect(byId['attachmentMissing']).toMatchObject({ severity: 'mustFix', rows: [4] });
    expect(byId['attachmentOutside']).toMatchObject({ severity: 'worthALook', rows: [3] });
    expect(check.attachments).toMatchObject({ files: 3 });
    expect(check.attachments.outsideFolders).toHaveLength(1);

    // The preview shows each person's files.
    const cara = await handlers['recipients:row']({ ...input, rowNo: 4 });
    expect(cara.attachments).toEqual([{ name: 'missing.pdf', size: 0, problem: 'missing' }]);

    // Trusting the folder clears the flag; leaving Cara out clears the must-fix.
    await handlers['recipients:approveFolders']({ token: input.token });
    const again = await handlers['recipients:check']({ ...input, skipRows: [4] });
    expect(again.problems.filter((p) => p.id.startsWith('attachment'))).toEqual([]);
    expect(again.problems.some((p) => p.severity === 'mustFix')).toBe(false);

    const started = await handlers['sends:start']({ ...input, skipRows: [4] });
    await until(started.id, (s) => s.status === 'finished' && !s.running);
    expect(delivered.map((e) => [e.to[0], e.attachments?.map((a) => a.filename)])).toEqual([
      ['asha@example.com', ['INV-1.pdf']],
      ['ben@example.com', ['brochure.pdf']],
    ]);
    expect(new TextDecoder().decode(delivered[0]?.attachments?.[0]?.content)).toBe('%PDF asha');
    rmSync(elsewhere, { recursive: true, force: true });
  });

  it('never attaches a key file', async () => {
    mkdirSync(join(listFolder, '.ssh'));
    writeFileSync(join(listFolder, '.ssh', 'id_rsa'), 'secret');
    listText = [
      'Email,First Name,Invoice No,Amount,Due Date,Attachment',
      'asha@example.com,Asha,INV-1,£120,1 Oct,.ssh/id_rsa',
    ].join('\n');
    const { input } = await setUp();
    const check = await handlers['recipients:check'](input);
    expect(check.problems).toContainEqual({
      id: 'attachmentBlocked',
      severity: 'mustFix',
      rows: [2],
    });
    await expect(handlers['sends:start'](input)).rejects.toMatchObject({
      messageKey: 'errors.sendHasProblems',
    });
  });
});

describe('the sending process runner', () => {
  function fakeChild() {
    const listeners: { message: ((m: FromSender) => void)[]; exit: ((code: number) => void)[] } = {
      message: [],
      exit: [],
    };
    const posted: unknown[] = [];
    const child: ChildProcessLike = {
      postMessage: (message) => posted.push(message),
      on: (event: 'message' | 'exit', listener: never) => {
        listeners[event].push(listener);
        return child;
      },
      kill: () => true,
    };
    return {
      child,
      posted,
      emit: (message: FromSender) => {
        for (const listener of listeners.message) listener(message);
      },
      exit: (code: number) => {
        for (const listener of listeners.exit) listener(code);
      },
    };
  }

  const job = { sendId: 's1' } as Parameters<ReturnType<typeof createProcessRunner>['start']>[0];

  it('answers the process when a sign-in token runs out part-way', async () => {
    const fake = fakeChild();
    const renew = vi
      .fn()
      .mockResolvedValueOnce({ accessToken: 'fresh', expiresAt: 1 })
      .mockRejectedValueOnce(Object.assign(new Error('x'), { messageKey: 'errors.signInExpired' }));
    const runner = createProcessRunner(
      { fork: () => fake.child, dbFile: '/db', renewAccessToken: renew },
      { onDone: vi.fn(), onProgress: vi.fn() },
    );
    runner.start({ ...job, accountId: 'a1' });
    fake.emit({ type: 'token-request', requestId: 7, renew: true });
    fake.emit({ type: 'token-request', requestId: 8, renew: false });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(renew).toHaveBeenCalledWith('a1', true);
    expect(fake.posted).toContainEqual({
      type: 'token',
      requestId: 7,
      token: { accessToken: 'fresh', expiresAt: 1 },
    });
    expect(fake.posted).toContainEqual({
      type: 'token',
      requestId: 8,
      error: 'errors.signInExpired',
    });
  });

  it('passes the job, Pause and Stop to the process, and reports its outcome', () => {
    const fake = fakeChild();
    const onDone = vi.fn();
    const onProgress = vi.fn();
    const runner = createProcessRunner(
      { fork: () => fake.child, dbFile: '/db' },
      { onDone, onProgress },
    );
    runner.start(job);
    expect(fake.posted[0]).toEqual({ type: 'start', job, dbFile: '/db' });
    expect(runner.isRunning('s1')).toBe(true);
    expect(runner.pause('s1', 'sleep')).toBe(true);
    expect(runner.stop('s1')).toBe(true);
    expect(fake.posted.slice(1)).toEqual([{ type: 'pause', reason: 'sleep' }, { type: 'stop' }]);

    const progress = { counts: {} as never, current: null, etaMs: 0 };
    fake.emit({ type: 'progress', progress });
    expect(onProgress).toHaveBeenCalledWith('s1', progress);
    const outcome: Outcome = { status: 'stopped' };
    fake.emit({ type: 'done', outcome });
    fake.exit(0);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith('s1', outcome);
    expect(runner.running()).toEqual([]);
    expect(runner.pause('s1', 'user')).toBe(false);
  });

  it('reports a crash when the process dies without finishing', () => {
    const fake = fakeChild();
    const onDone = vi.fn();
    const runner = createProcessRunner(
      { fork: () => fake.child, dbFile: '/db' },
      { onDone, onProgress: vi.fn() },
    );
    runner.start(job);
    runner.start(job); // already running: no second process
    fake.exit(1);
    expect(onDone).toHaveBeenCalledWith('s1', { status: 'crashed' });
    expect(runner.isRunning('s1')).toBe(false);
  });
});
