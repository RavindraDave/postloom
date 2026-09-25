import {
  createRepositories,
  openDatabase,
  type OpenedDatabase,
  type Repositories,
} from '@postloom/db';
import type { OutgoingEmail, SendResult } from '@postloom/email';
import { SendFailure } from '@postloom/email';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BuildError } from './attachments';
import { runSend, type EngineOptions, type Progress } from './engine';
import { createMessageBuilder } from './message';
import { createEngineStore } from './store';

const TODAY = '2026-09-25';
let opened: OpenedDatabase;
let repos: Repositories;
let accountId: string;

beforeEach(async () => {
  opened = await openDatabase({ file: ':memory:' });
  repos = createRepositories(opened.db);
  const account = await repos.accounts.create({
    name: 'Office',
    provider: 'other',
    host: 'smtp.example.com',
    port: 587,
    security: 'starttls',
    username: 'asha@example.com',
    dailyLimit: null,
    delayMs: null,
  });
  accountId = account.id;
});
afterEach(async () => {
  await opened.close();
});

async function makeSend(people: number) {
  const sender = await repos.senders.create({
    name: 'Asha',
    emailAccountId: accountId,
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
    document: { type: 'doc', content: [] },
    documentVersion: 1,
    defaultSenderProfileId: null,
  });
  const version = await repos.templates.snapshot(template.id, 'Sent');
  return repos.sends.create({
    templateId: template.id,
    templateVersionId: version.id,
    senderProfileId: sender.id,
    emailAccountId: accountId,
    settings: { delayMs: 1000, dailyLimit: 500 },
    sourceFileName: 'list.csv',
    sourceFileSha256: 'x',
    mapping: {},
    recipients: Array.from({ length: people }, (_, i) => ({
      rowNo: i + 2,
      to: [`p${String(i + 1)}@example.com`],
      cc: [],
      bcc: [],
      values: { 'First Name': `P${String(i + 1)}` },
    })),
  });
}

const build = createMessageBuilder({
  template: {
    html: '<p>Dear {{ row["First Name"] }}</p>',
    subject: 'Hi {{First Name}}',
    fallbackSubject: 'Hello',
  },
  from: { name: 'Asha', address: 'asha@example.com' },
  inlineImages: [],
});

interface Harness {
  sent: OutgoingEmail[];
  sleeps: number[];
  run: (overrides?: Partial<EngineOptions>) => ReturnType<typeof runSend>;
}

function harness(
  sendId: string,
  respond: (email: OutgoingEmail, call: number) => SendResult | Error = () => ({
    messageId: '<ok@test>',
    accepted: [],
    rejected: [],
  }),
): Harness {
  const sent: OutgoingEmail[] = [];
  const sleeps: number[] = [];
  let calls = 0;
  return {
    sent,
    sleeps,
    run: (overrides = {}) =>
      runSend({
        store: createEngineStore(repos, sendId, accountId, () => TODAY),
        send: (email) => {
          calls += 1;
          const result = respond(email, calls);
          if (result instanceof Error) return Promise.reject(result);
          sent.push(email);
          return Promise.resolve({ ...result, messageId: `<${String(calls)}@test>` });
        },
        build,
        delayMs: 1000,
        dailyLimit: 500,
        requested: () => null,
        sleep: (ms) => {
          sleeps.push(ms);
          return Promise.resolve();
        },
        random: () => 0.5,
        ...overrides,
      }),
  };
}

const smtpError = (fields: Record<string, unknown>) =>
  Object.assign(new Error('smtp'), fields) as Error;

describe('sending engine', () => {
  it('emails everyone once, in row order, with their own details and a gap between', async () => {
    const send = await makeSend(3);
    const progress: Progress[] = [];
    const h = harness(send.id);

    expect(await h.run({ onProgress: (p) => progress.push(p), progressEveryMs: 0 })).toEqual({
      status: 'finished',
    });
    expect(h.sent.map((e) => [e.to[0], e.subject])).toEqual([
      ['p1@example.com', 'Hi P1'],
      ['p2@example.com', 'Hi P2'],
      ['p3@example.com', 'Hi P3'],
    ]);
    expect(h.sent[0]?.html).toBe('<p>Dear P1</p>');
    expect(h.sleeps).toEqual([1000, 1000]);
    expect(await repos.sends.get(send.id)).toMatchObject({ status: 'finished' });
    expect(await repos.sends.counts(send.id)).toMatchObject({ sent: 3, pending: 0 });
    expect(await repos.usage.sentOn(accountId, TODAY)).toBe(3);
    expect(progress.at(-1)).toMatchObject({ counts: { sent: 3 }, current: null, etaMs: 0 });
    expect(progress.some((p) => p.current?.to === 'p2@example.com')).toBe(true);
  });

  it('pauses between emails and later carries on with only the people left', async () => {
    const send = await makeSend(4);
    const h = harness(send.id);
    let pause = false;
    const first = h.run({
      requested: () => (pause ? 'user' : null),
      sleep: () => {
        pause = true;
        return Promise.resolve();
      },
    });
    expect(await first).toEqual({ status: 'paused', reason: 'user' });
    expect(h.sent).toHaveLength(1);
    expect(await repos.sends.get(send.id)).toMatchObject({ status: 'paused', pauseReason: 'user' });

    expect(await h.run()).toEqual({ status: 'finished' });
    expect(h.sent.map((e) => e.to[0])).toEqual([
      'p1@example.com',
      'p2@example.com',
      'p3@example.com',
      'p4@example.com',
    ]);
  });

  it('stops when asked, and a stopped send can be resumed', async () => {
    const send = await makeSend(2);
    const h = harness(send.id);
    expect(await h.run({ requested: () => 'stop' })).toEqual({ status: 'stopped' });
    expect(h.sent).toHaveLength(0);
    expect(await repos.sends.get(send.id)).toMatchObject({ status: 'stopped' });
    expect(await h.run()).toEqual({ status: 'finished' });
  });

  it('pauses at the daily limit, counting other sends from the same account', async () => {
    await repos.usage.add(accountId, TODAY, 3);
    const send = await makeSend(4);
    const h = harness(send.id);
    expect(await h.run({ dailyLimit: 5 })).toEqual({ status: 'paused', reason: 'dailyLimit' });
    expect(h.sent).toHaveLength(2);
    expect(await repos.sends.counts(send.id)).toMatchObject({ sent: 2, pending: 2 });
  });

  it('tries again when the server says "not now", then succeeds', async () => {
    const send = await makeSend(1);
    const h = harness(send.id, (_e, call) =>
      call === 1 ? smtpError({ responseCode: 451 }) : { messageId: '', accepted: [], rejected: [] },
    );
    expect(await h.run()).toEqual({ status: 'finished' });
    expect(h.sleeps).toEqual([5000]);
    expect(await repos.sends.counts(send.id)).toMatchObject({ sent: 1 });
  });

  it('gives up on one person after three "not now"s and carries on', async () => {
    const send = await makeSend(2);
    const h = harness(send.id, (email) =>
      email.to[0] === 'p1@example.com'
        ? smtpError({ responseCode: 452 })
        : { messageId: '', accepted: [], rejected: [] },
    );
    expect(await h.run()).toEqual({ status: 'finished' });
    const [failed] = await repos.sends.recipients(send.id, 'failed');
    expect(failed).toMatchObject({ rowNo: 2, errorCode: 'temporary:452' });
    expect(h.sent.map((e) => e.to[0])).toEqual(['p2@example.com']);
  });

  it('fails a rejected address at once and moves on', async () => {
    const send = await makeSend(2);
    const h = harness(send.id, (email) =>
      email.to[0] === 'p1@example.com'
        ? smtpError({ responseCode: 550 })
        : { messageId: '', accepted: [], rejected: [] },
    );
    expect(await h.run()).toEqual({ status: 'finished' });
    expect((await repos.sends.recipients(send.id, 'failed'))[0]?.errorCode).toBe('rejected:550');
    expect(h.sleeps).toEqual([]);
  });

  it('pauses when the password stops working, keeping the person in the queue', async () => {
    const send = await makeSend(2);
    const h = harness(send.id, () => smtpError({ code: 'EAUTH', responseCode: 535 }));
    expect(await h.run()).toEqual({ status: 'paused', reason: 'auth' });
    expect(await repos.sends.counts(send.id)).toMatchObject({ pending: 2, sending: 0 });
  });

  it('pauses when the server can’t be reached, keeping the person in the queue', async () => {
    const send = await makeSend(2);
    const h = harness(send.id, () => smtpError({ code: 'ECONNREFUSED' }));
    expect(await h.run()).toEqual({ status: 'paused', reason: 'connection' });
    expect(h.sleeps).toEqual([5000, 30000]);
    expect(await repos.sends.counts(send.id)).toMatchObject({ pending: 2 });
  });

  it('never retries an email that may have gone through, and pauses if it keeps happening', async () => {
    const send = await makeSend(5);
    const h = harness(send.id, () => smtpError({ code: 'ETIMEDOUT' }));
    expect(await h.run()).toEqual({ status: 'paused', reason: 'connection' });
    expect(await repos.sends.counts(send.id)).toMatchObject({ uncertain: 3, pending: 2 });
    expect(h.sleeps).toEqual([]);
  });

  it('marks a person failed when their email can’t be built', async () => {
    const send = await makeSend(1);
    const h = harness(send.id);
    expect(await h.run({ build: () => Promise.reject(new Error('bad')) })).toEqual({
      status: 'finished',
    });
    expect((await repos.sends.recipients(send.id, 'failed'))[0]?.errorCode).toBe('template');
  });

  it('records a missing attachment as that person’s reason', async () => {
    const send = await makeSend(2);
    const h = harness(send.id);
    let calls = 0;
    const outcome = await h.run({
      build: (person) => {
        calls += 1;
        return calls === 1 ? Promise.reject(new BuildError('attachmentMissing')) : build(person);
      },
    });
    expect(outcome).toEqual({ status: 'finished' });
    expect((await repos.sends.recipients(send.id, 'failed'))[0]?.errorCode).toBe(
      'attachmentMissing',
    );
    expect(h.sent).toHaveLength(1);
  });

  it('treats an invalid email as failed without contacting the server again', async () => {
    const send = await makeSend(1);
    const h = harness(send.id, () => new SendFailure('invalid', 'errors.headerLineBreak'));
    await h.run();
    expect((await repos.sends.recipients(send.id, 'failed'))[0]?.errorCode).toBe('invalid');
  });

  it('after a crash between sending and saving, that person is never emailed again automatically', async () => {
    const send = await makeSend(2);
    const h = harness(send.id);
    const store = createEngineStore(repos, send.id, accountId, () => TODAY);
    // The app dies right after the server took the first email.
    await expect(
      h.run({
        store: {
          ...store,
          markSent: () => Promise.reject(new Error('power cut')),
        },
      }),
    ).rejects.toThrow('power cut');
    expect(h.sent).toHaveLength(1);

    await repos.sends.recoverInterrupted();
    expect(await h.run()).toEqual({ status: 'finished' });
    expect(h.sent.map((e) => e.to[0])).toEqual(['p1@example.com', 'p2@example.com']);
    expect(await repos.sends.counts(send.id)).toMatchObject({ uncertain: 1, sent: 1 });
  });

  it('never emails anyone twice, whatever the server does (randomised)', async () => {
    let seed = 42;
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    const outcomes = [
      () => ({ messageId: '', accepted: [], rejected: [] }),
      () => smtpError({ responseCode: 451 }),
      () => smtpError({ responseCode: 550 }),
      () => smtpError({ code: 'ECONNREFUSED' }),
      () => smtpError({ code: 'ETIMEDOUT' }),
      () => smtpError({ code: 'EAUTH' }),
    ];
    for (let round = 0; round < 20; round += 1) {
      const send = await makeSend(15);
      const accepted = new Map<string, number>();
      const h = harness(send.id, (email) => {
        const pick = random();
        const outcome = pick < 0.6 ? outcomes[0]! : outcomes[1 + Math.floor(random() * 5)]!;
        const result = outcome();
        const address = email.to[0] ?? '';
        // An "uncertain" failure may have been delivered: count it as received.
        if (!(result instanceof Error) || (result as { code?: string }).code === 'ETIMEDOUT') {
          accepted.set(address, (accepted.get(address) ?? 0) + 1);
        }
        return result;
      });
      for (let resume = 0; resume < 30; resume += 1) {
        const outcome = await h.run({
          random,
          requested: () => (random() < 0.05 ? 'user' : null),
        });
        if (outcome.status === 'finished') break;
      }
      for (const [address, times] of accepted) {
        expect(times, address).toBe(1);
      }
      const counts = await repos.sends.counts(send.id);
      expect(counts.sending).toBe(0);
    }
  });
});
