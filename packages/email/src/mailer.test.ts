import { AppError } from '@postloom/core';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { SMTPServer, type SMTPServerOptions } from 'smtp-server';
import { afterEach, describe, expect, it } from 'vitest';
import { classifyFailure, openMailer, SendFailure, type Mailer } from './mailer';
import type { OutgoingEmail, SmtpAccountConfig } from './smtp';

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../test/fixtures/${name}`, import.meta.url)), 'utf8');
const key = fixture('localhost-test-only.key');
const cert = fixture('localhost-test-only.crt');
const USER = 'asha@example.com';
const PASSWORD = 'correct-app-password';

let server: SMTPServer | undefined;
let mailer: Mailer | undefined;
let received: { rcpt: string[]; data: string }[] = [];
let connections = 0;

async function startServer(options: Partial<SMTPServerOptions> = {}): Promise<number> {
  received = [];
  connections = 0;
  server = new SMTPServer({
    key,
    cert,
    logger: false,
    authMethods: ['PLAIN', 'LOGIN'],
    onConnect(_session, callback) {
      connections += 1;
      callback();
    },
    onAuth(auth, _session, callback) {
      if (auth.username === USER && auth.password === PASSWORD) {
        callback(null, { user: auth.username });
      } else {
        callback(new Error('Invalid credentials'));
      }
    },
    onData(stream, session, callback) {
      let data = '';
      stream.on('data', (chunk: Buffer) => (data += chunk.toString('utf8')));
      stream.on('end', () => {
        received.push({ rcpt: session.envelope.rcptTo.map((r) => r.address), data });
        callback();
      });
    },
    ...options,
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  return (server.server.address() as AddressInfo).port;
}

afterEach(async () => {
  mailer?.close();
  mailer = undefined;
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

const account = (port: number, overrides: Partial<SmtpAccountConfig> = {}): SmtpAccountConfig => ({
  host: 'localhost',
  port,
  security: 'starttls',
  username: USER,
  password: PASSWORD,
  extraCa: cert,
  connectionTimeoutMs: 3000,
  ...overrides,
});

const email = (to: string): OutgoingEmail => ({
  from: { name: 'Asha', address: USER },
  to: [to],
  subject: 'Your invoice',
  html: '<p>Hello</p>',
  text: 'Hello',
});

const failureOf = async (work: Promise<unknown>) => {
  try {
    await work;
  } catch (error) {
    return error;
  }
  throw new Error('expected a failure');
};

describe('mailer', () => {
  it('sends several emails over one connection, with Cc and Bcc', async () => {
    const port = await startServer();
    mailer = openMailer(account(port));
    await mailer.send({
      ...email('a@example.com'),
      cc: ['boss@example.com'],
      bcc: ['me@example.com'],
    });
    await mailer.send(email('b@example.com'));
    await mailer.send(email('c@example.com'));

    expect(received.map((r) => r.rcpt)).toEqual([
      ['a@example.com', 'boss@example.com', 'me@example.com'],
      ['b@example.com'],
      ['c@example.com'],
    ]);
    expect(received[0]?.data).toContain('Cc: boss@example.com');
    // Bcc never appears in the message itself.
    expect(received[0]?.data).not.toContain('me@example.com');
    expect(connections).toBe(1);
  });

  it('attaches files', async () => {
    const port = await startServer();
    mailer = openMailer(account(port));
    await mailer.send({
      ...email('a@example.com'),
      attachments: [{ filename: 'INV-1.pdf', content: new TextEncoder().encode('%PDF-1.7') }],
    });
    expect(received[0]?.data).toContain('Content-Disposition: attachment; filename=INV-1.pdf');
  });

  it('says "try again later" when the server refuses for now (4xx)', async () => {
    const port = await startServer({
      onRcptTo(_address, _session, callback) {
        callback(Object.assign(new Error('Greylisted'), { responseCode: 451 }));
      },
    });
    mailer = openMailer(account(port));
    expect(await failureOf(mailer.send(email('a@example.com')))).toMatchObject({
      kind: 'retry',
      reason: '451',
    });
  });

  it('fails for good when the mailbox doesn’t exist (5xx)', async () => {
    const port = await startServer({
      onRcptTo(_address, _session, callback) {
        callback(Object.assign(new Error('No such user'), { responseCode: 550 }));
      },
    });
    mailer = openMailer(account(port));
    expect(await failureOf(mailer.send(email('nobody@example.com')))).toMatchObject({
      kind: 'rejected',
      reason: '550',
    });
  });

  it('reports a password that stopped working', async () => {
    const port = await startServer();
    mailer = openMailer(account(port, { password: 'wrong' }));
    expect(await failureOf(mailer.send(email('a@example.com')))).toMatchObject({ kind: 'auth' });
  });

  it('reports an unreachable server as offline (nothing sent)', async () => {
    const port = await startServer();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
    mailer = openMailer(account(port));
    expect(await failureOf(mailer.send(email('a@example.com')))).toMatchObject({ kind: 'offline' });
  });

  it('refuses an email with a line break in a header before contacting anyone', async () => {
    mailer = openMailer(account(1));
    expect(
      await failureOf(mailer.send({ ...email('a@example.com'), cc: ['x@example.com\r\nBcc: y'] })),
    ).toMatchObject({ kind: 'invalid' });
  });
});

describe('classifyFailure', () => {
  it.each([
    [{ code: 'EAUTH', responseCode: 535 }, 'auth'],
    [{ responseCode: 421 }, 'retry'],
    [{ responseCode: 452 }, 'retry'],
    [{ responseCode: 554 }, 'rejected'],
    [{ code: 'ECONNREFUSED' }, 'offline'],
    [{ code: 'ETIMEDOUT', command: 'CONN' }, 'offline'],
    // A connection lost part-way might have delivered the email.
    [{ code: 'ETIMEDOUT' }, 'uncertain'],
    [{ code: 'ECONNRESET', command: 'DATA' }, 'uncertain'],
    [new Error('something odd'), 'uncertain'],
  ])('%o is %s', (error, kind) => {
    expect(classifyFailure(error).kind).toBe(kind);
  });

  it('keeps a failure already classified, and treats invalid emails as such', () => {
    const failure = new SendFailure('rejected', '550');
    expect(classifyFailure(failure)).toBe(failure);
    expect(
      classifyFailure(new AppError({ code: 'VALIDATION_FAILED', messageKey: 'errors.x' })).kind,
    ).toBe('invalid');
  });
});
