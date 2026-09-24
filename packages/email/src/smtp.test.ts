import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { SMTPServer, type SMTPServerOptions } from 'smtp-server';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertNoHeaderInjection,
  sendEmail,
  verifySmtpAccount,
  type OutgoingEmail,
  type SmtpAccountConfig,
} from './smtp';

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../test/fixtures/${name}`, import.meta.url)), 'utf8');
const key = fixture('localhost-test-only.key');
const cert = fixture('localhost-test-only.crt');

const USER = 'asha@example.com';
const PASSWORD = 'correct-app-password';

let server: SMTPServer | undefined;
let received: string[] = [];

async function startServer(options: Partial<SMTPServerOptions> = {}): Promise<number> {
  received = [];
  server = new SMTPServer({
    key,
    cert,
    logger: false,
    authMethods: ['PLAIN', 'LOGIN'],
    onAuth(auth, _session, callback) {
      if (auth.username === USER && auth.password === PASSWORD) {
        callback(null, { user: auth.username });
      } else {
        callback(new Error('Invalid credentials'));
      }
    },
    onData(stream, _session, callback) {
      let data = '';
      stream.on('data', (chunk: Buffer) => (data += chunk.toString('utf8')));
      stream.on('end', () => {
        received.push(data);
        callback();
      });
    },
    ...options,
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  return (server.server.address() as AddressInfo).port;
}

afterEach(async () => {
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

const email: OutgoingEmail = {
  from: { name: 'Asha (Accounts)', address: USER },
  to: ['rahul@example.com'],
  subject: 'Your invoice',
  html: '<p>Hello <b>Rahul</b></p>',
  text: 'Hello Rahul',
};

describe('SMTP sending', () => {
  it('verifies an account over STARTTLS', async () => {
    const port = await startServer();

    await expect(verifySmtpAccount(account(port))).resolves.toBeUndefined();
  });

  it('delivers an email with HTML and plain-text parts', async () => {
    const port = await startServer();

    const result = await sendEmail(account(port), email);

    expect(result.accepted).toEqual(['rahul@example.com']);
    expect(received).toHaveLength(1);
    expect(received[0]).toContain('Subject: Your invoice');
    expect(received[0]).toContain('text/html');
    expect(received[0]).toContain('text/plain');
  });

  it('reports a wrong password as an authentication problem', async () => {
    const port = await startServer();

    await expect(verifySmtpAccount(account(port, { password: 'wrong' }))).rejects.toMatchObject({
      code: 'EMAIL_AUTH_FAILED',
    });
  });

  it('refuses servers whose certificate is not trusted', async () => {
    const port = await startServer();

    await expect(verifySmtpAccount(account(port, { extraCa: undefined }))).rejects.toMatchObject({
      code: 'EMAIL_CONNECTION_FAILED',
    });
  });

  it('refuses to sign in over an unencrypted connection', async () => {
    const port = await startServer({ disabledCommands: ['STARTTLS'], allowInsecureAuth: true });

    await expect(verifySmtpAccount(account(port))).rejects.toMatchObject({
      code: 'EMAIL_CONNECTION_FAILED',
    });
  });

  it('reports an unreachable server as a connection problem', async () => {
    const port = await startServer();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;

    await expect(verifySmtpAccount(account(port))).rejects.toMatchObject({
      code: 'EMAIL_CONNECTION_FAILED',
    });
  });
});

describe('assertNoHeaderInjection', () => {
  it.each([
    ['subject', { ...email, subject: 'Hi\r\nBcc: attacker@example.com' }],
    ['recipient', { ...email, to: ['a@example.com\nBcc: attacker@example.com'] }],
    ['sender name', { ...email, from: { name: 'Asha\r\nX-Evil: 1', address: USER } }],
  ])('rejects line breaks in the %s', (_field, message) => {
    expect(() => assertNoHeaderInjection(message)).toThrow(
      expect.objectContaining({ code: 'VALIDATION_FAILED' }),
    );
  });
});
