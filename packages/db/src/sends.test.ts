import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type OpenedDatabase } from './open';
import { createRepositories, MAX_TEMPLATE_VERSIONS, type Repositories } from './repositories';
import type { NewSend } from './sends';
import { steppingClock } from './test-helpers';

let opened: OpenedDatabase;
let repos: Repositories;

beforeEach(async () => {
  opened = await openDatabase({ file: ':memory:' });
  let n = 0;
  repos = createRepositories(opened.db, { now: steppingClock(), newId: () => `id-${++n}` });
});
afterEach(async () => {
  await opened.close();
});

const letter = { type: 'doc', content: [{ type: 'paragraph' }] };

async function newSend(people = 3): Promise<NewSend> {
  const account = await repos.accounts.create({
    name: 'Office',
    provider: 'gmail',
    host: 'smtp.gmail.com',
    port: 587,
    security: 'starttls',
    username: 'asha@example.com',
    dailyLimit: null,
    delayMs: null,
  });
  const sender = await repos.senders.create({
    name: 'Asha',
    emailAccountId: account.id,
    fromName: 'Asha',
    fromAddress: 'asha@example.com',
    replyTo: null,
    defaultCc: null,
    defaultBcc: null,
    brandKitId: null,
    delayMs: null,
  });
  const template = await repos.templates.create({
    name: 'Reminder',
    subject: 'Hello',
    category: null,
    editorMode: 'write',
    document: letter,
    documentVersion: 1,
    defaultSenderProfileId: null,
  });
  const version = await repos.templates.snapshot(template.id, 'Sent');
  return {
    templateId: template.id,
    templateVersionId: version.id,
    senderProfileId: sender.id,
    emailAccountId: account.id,
    settings: { delayMs: 2000, dailyLimit: 450 },
    sourceFileName: 'list.csv',
    sourceFileSha256: 'abc',
    mapping: { to: 'Email' },
    recipients: Array.from({ length: people }, (_, i) => ({
      rowNo: i + 2,
      to: [`person${String(i + 1)}@example.com`],
      cc: i === 0 ? ['boss@example.com', 'team@example.com'] : [],
      bcc: [],
      values: { 'First Name': `Person ${String(i + 1)}` },
      attachments: i === 0 ? ['/files/INV-1.pdf', '/files/terms.pdf'] : [],
    })),
  };
}

describe('sends', () => {
  it('stores a send with its people, ready to go', async () => {
    const send = await repos.sends.create(await newSend());
    expect(send).toMatchObject({
      status: 'ready',
      pauseReason: null,
      settings: { delayMs: 2000, dailyLimit: 450 },
      mapping: { to: 'Email' },
    });
    const people = await repos.sends.recipients(send.id);
    expect(people.map((p) => p.rowNo)).toEqual([2, 3, 4]);
    expect(people[0]).toMatchObject({
      to: ['person1@example.com'],
      cc: ['boss@example.com', 'team@example.com'],
      bcc: [],
      values: { 'First Name': 'Person 1' },
      attachments: ['/files/INV-1.pdf', '/files/terms.pdf'],
      status: 'pending',
      attempts: 0,
    });
    expect(await repos.sends.counts(send.id)).toMatchObject({ pending: 3, sent: 0 });
  });

  it('keeps left-out rows as skipped, with the reason', async () => {
    const input = await newSend(2);
    input.recipients[1] = { ...input.recipients[1]!, skipped: 'doNotEmail' };
    const send = await repos.sends.create(input);
    expect(await repos.sends.counts(send.id)).toMatchObject({ pending: 1, skipped: 1 });
    expect((await repos.sends.recipients(send.id, 'skipped'))[0]?.errorCode).toBe('doNotEmail');
  });

  it('stores thousands of people in one go', async () => {
    const send = await repos.sends.create(await newSend(2500));
    expect((await repos.sends.counts(send.id)).pending).toBe(2500);
  });

  it('claims each person once, in row order, and records the outcome', async () => {
    const send = await repos.sends.create(await newSend());
    const first = await repos.sends.nextPending(send.id);
    expect(first?.rowNo).toBe(2);
    expect(await repos.sends.claim(first!.id)).toBe(true);
    // A second claim of the same person fails: nobody is emailed twice.
    expect(await repos.sends.claim(first!.id)).toBe(false);
    expect(await repos.sends.markSent(first!.id, '<m1@example.com>')).toBe(true);
    // Only someone being sent can be marked sent.
    expect(await repos.sends.markFailed(first!.id, 'rejected')).toBe(false);

    const second = await repos.sends.nextPending(send.id);
    expect(second?.rowNo).toBe(3);
    await repos.sends.claim(second!.id);
    await repos.sends.markFailed(second!.id, 'rejected');

    const third = await repos.sends.nextPending(send.id);
    await repos.sends.claim(third!.id);
    await repos.sends.release(third!.id);
    expect((await repos.sends.nextPending(send.id))?.id).toBe(third!.id);

    expect(await repos.sends.counts(send.id)).toMatchObject({ sent: 1, failed: 1, pending: 1 });
    const [sent] = await repos.sends.recipients(send.id, 'sent');
    expect(sent).toMatchObject({ messageId: '<m1@example.com>', attempts: 1 });
  });

  it('records when a send starts, pauses (and why) and finishes', async () => {
    const send = await repos.sends.create(await newSend());
    await repos.sends.setStatus(send.id, 'sending');
    const started = (await repos.sends.get(send.id)).startedAt;
    expect(started).not.toBeNull();
    await repos.sends.setStatus(send.id, 'paused', 'dailyLimit');
    expect(await repos.sends.get(send.id)).toMatchObject({
      status: 'paused',
      pauseReason: 'dailyLimit',
    });
    await repos.sends.setStatus(send.id, 'sending');
    await repos.sends.setStatus(send.id, 'finished');
    const finished = await repos.sends.get(send.id);
    expect(finished).toMatchObject({ status: 'finished', pauseReason: null, startedAt: started });
    expect(finished.finishedAt).not.toBeNull();
  });

  it('after a crash, never resends someone who may already have been emailed', async () => {
    const send = await repos.sends.create(await newSend());
    await repos.sends.setStatus(send.id, 'sending');
    const first = await repos.sends.nextPending(send.id);
    await repos.sends.claim(first!.id);

    expect(await repos.sends.recoverInterrupted()).toEqual([send.id]);
    expect(await repos.sends.get(send.id)).toMatchObject({
      status: 'paused',
      pauseReason: 'interrupted',
    });
    expect(await repos.sends.counts(send.id)).toMatchObject({ uncertain: 1, pending: 2 });
    // The uncertain person is not next in line.
    expect((await repos.sends.nextPending(send.id))?.rowNo).toBe(3);
    // Nothing more to recover the second time.
    expect(await repos.sends.recoverInterrupted()).toEqual([]);
  });

  it('recovers one send whose sending process died, leaving others alone', async () => {
    const input = await newSend(2);
    const crashed = await repos.sends.create(input);
    const other = await repos.sends.create(input);
    for (const send of [crashed, other]) {
      await repos.sends.setStatus(send.id, 'sending');
      await repos.sends.claim((await repos.sends.nextPending(send.id))!.id);
    }
    await repos.sends.recoverSend(crashed.id);
    expect(await repos.sends.get(crashed.id)).toMatchObject({
      status: 'paused',
      pauseReason: 'interrupted',
    });
    expect(await repos.sends.counts(crashed.id)).toMatchObject({ uncertain: 1, sending: 0 });
    expect(await repos.sends.counts(other.id)).toMatchObject({ sending: 1 });
    expect((await repos.sends.get(other.id)).status).toBe('sending');
  });

  it('lets the person resend or skip uncertain emails, and retry failed ones', async () => {
    const send = await repos.sends.create(await newSend());
    const [a, b] = await repos.sends.recipients(send.id);
    await repos.sends.claim(a!.id);
    await repos.sends.markUncertain(a!.id, 'timeout');
    await repos.sends.claim(b!.id);
    await repos.sends.markFailed(b!.id, 'temporary');

    expect(await repos.sends.resolveUncertain(send.id, 'skip')).toBe(1);
    expect((await repos.sends.recipients(send.id, 'skipped'))[0]?.errorCode).toBe(
      'uncertainSkipped',
    );
    expect(await repos.sends.retryFailed(send.id)).toBe(1);
    expect(await repos.sends.counts(send.id)).toMatchObject({ pending: 2, skipped: 1, failed: 0 });

    await repos.sends.claim(b!.id);
    await repos.sends.markUncertain(b!.id, 'timeout');
    expect(await repos.sends.resolveUncertain(send.id, 'resend')).toBe(1);
    expect(await repos.sends.counts(send.id)).toMatchObject({ pending: 2 });
  });

  it('keeps a template version that was sent, even past the version limit', async () => {
    const input = await newSend(1);
    await repos.sends.create(input);
    for (let i = 0; i < MAX_TEMPLATE_VERSIONS + 2; i += 1) {
      await repos.templates.update(
        input.templateId,
        { subject: `v${String(i)}` },
        { snapshot: true },
      );
    }
    expect((await repos.templates.version(input.templateVersionId)).note).toBe('Sent');
  });

  it('lists sends newest first and reports unknown ones', async () => {
    const input = await newSend(1);
    const older = await repos.sends.create(input);
    const newer = await repos.sends.create(input);
    expect((await repos.sends.list()).map((s) => s.id)).toEqual([newer.id, older.id]);
    await expect(repos.sends.get('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
