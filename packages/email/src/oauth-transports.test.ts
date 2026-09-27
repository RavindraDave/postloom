import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { SMTPServer } from 'smtp-server';
import { afterEach, describe, expect, it } from 'vitest';
import type { SendFailure } from './mailer';
import { classifyFailure, openMailer, type Mailer } from './mailer';
import { sendEmail, type OutgoingEmail, type SmtpAccountConfig } from './smtp';

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../test/fixtures/${name}`, import.meta.url)), 'utf8');
const cert = fixture('localhost-test-only.crt');
const key = fixture('localhost-test-only.key');
const USER = 'asha@example.com';

const email = (to: string, extra: Partial<OutgoingEmail> = {}): OutgoingEmail => ({
  from: { name: 'Asha', address: USER },
  to: [to],
  subject: 'Your invoice',
  html: '<p>Hello</p>',
  text: 'Hello',
  ...extra,
});

let mailer: Mailer | undefined;
let http: Server | undefined;
let smtp: SMTPServer | undefined;

afterEach(async () => {
  mailer?.close();
  mailer = undefined;
  await new Promise<void>((resolve) => (http ? http.close(() => resolve()) : resolve()));
  await new Promise<void>((resolve) => (smtp ? smtp.close(() => resolve()) : resolve()));
  http = undefined;
  smtp = undefined;
});

// ------------------------------------------------------------- Gmail API

interface Upload {
  token: string;
  raw: string;
}

/** A fake Gmail API: accepts `valid` tokens; `statuses` answer the next requests in turn. */
async function startGmail(valid: string[], statuses: number[] = []) {
  const uploads: Upload[] = [];
  http = createServer((request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const token = (request.headers.authorization ?? '').replace(/^Bearer /, '');
      const forced = statuses.shift();
      if (forced) {
        response.writeHead(forced).end('{}');
        return;
      }
      if (
        request.url !== '/upload/gmail/v1/users/me/messages/send?uploadType=media' ||
        request.headers['content-type'] !== 'message/rfc822'
      ) {
        response.writeHead(404).end();
        return;
      }
      if (!valid.includes(token)) {
        response.writeHead(401).end('{}');
        return;
      }
      uploads.push({ token, raw: Buffer.concat(chunks).toString('utf8') });
      response
        .writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ id: `msg-${String(uploads.length)}` }));
    });
  });
  await new Promise<void>((resolve) => http!.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${String((http.address() as AddressInfo).port)}`;
  return { base, uploads };
}

const gmailAccount = (base: string, token = 'good', expiresAt = Date.now() + 3_600_000) =>
  ({
    host: 'smtp.gmail.com',
    port: 587,
    security: 'starttls',
    username: USER,
    password: '',
    via: 'gmail-api',
    gmailApiBase: base,
    oauth: { accessToken: token, expiresAt },
  }) satisfies SmtpAccountConfig;

describe('sending with the Gmail API', () => {
  it('sends the whole email, Bcc included for Gmail to deliver', async () => {
    const gmail = await startGmail(['good']);
    mailer = openMailer(gmailAccount(gmail.base));
    const result = await mailer.send(
      email('a@example.com', { cc: ['boss@example.com'], bcc: ['me@example.com'] }),
    );
    expect(result).toEqual({
      messageId: 'msg-1',
      accepted: ['a@example.com', 'boss@example.com', 'me@example.com'],
      rejected: [],
    });
    const raw = gmail.uploads[0]?.raw ?? '';
    expect(raw).toContain('Subject: Your invoice');
    expect(raw).toContain('Cc: boss@example.com');
    expect(raw).toContain('Bcc: me@example.com');
  });

  it('renews a token that runs out, and one that is refused', async () => {
    const gmail = await startGmail(['fresh-1', 'fresh-2']);
    const renewals: boolean[] = [];
    let n = 0;
    mailer = openMailer(gmailAccount(gmail.base, 'old', Date.now() - 1000), (renew) => {
      renewals.push(renew);
      n += 1;
      return Promise.resolve({
        accessToken: `fresh-${String(n)}`,
        expiresAt: Date.now() + 3_600_000,
      });
    });
    await mailer.send(email('a@example.com'));
    expect(renewals).toEqual([false]);
    expect(gmail.uploads[0]?.token).toBe('fresh-1');

    // Google refuses the token (revoked): renewed once, and the email goes.
    const refused = await startGmail(['fresh-2']);
    mailer = openMailer(gmailAccount(refused.base, 'stale'), (renew) => {
      renewals.push(renew);
      return Promise.resolve({ accessToken: 'fresh-2', expiresAt: Date.now() + 3_600_000 });
    });
    await mailer.send(email('b@example.com'));
    expect(renewals).toEqual([false, true]);
    expect(refused.uploads[0]?.token).toBe('fresh-2');
  });

  it('says what each failure means for the person being emailed', async () => {
    const gmail = await startGmail(['good'], [401, 429, 400, 503]);
    mailer = openMailer(gmailAccount(gmail.base));
    const kinds: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      try {
        await mailer.send(email('a@example.com'));
      } catch (error) {
        kinds.push((error as SendFailure).kind);
      }
    }
    // Signed out; busy (nothing sent, try later); refused for good; maybe sent.
    expect(kinds).toEqual(['auth', 'retry', 'rejected', 'uncertain']);
  });

  it('tells "couldn\'t connect" from "may have been sent"', async () => {
    const gmail = await startGmail([]);
    const base = gmail.base;
    await new Promise<void>((resolve) => http!.close(() => resolve()));
    http = undefined;
    mailer = openMailer(gmailAccount(base));
    const failure = await mailer.send(email('a@example.com')).catch((error: unknown) => error);
    expect((failure as SendFailure).kind).toBe('offline');
  });

  it('sends one-off emails (tests) the same way', async () => {
    const gmail = await startGmail(['good']);
    const result = await sendEmail(gmailAccount(gmail.base), email('me@example.com'));
    expect(result.messageId).toBe('msg-1');
  });

  it('treats a failed renewal as signed out', () => {
    const error = Object.assign(new Error('Sign-in expired'), { code: 'EOAUTH2' });
    expect(classifyFailure(error).kind).toBe('auth');
  });
});

// ------------------------------------------------------ SMTP with XOAUTH2

describe('SMTP with a Microsoft sign-in (XOAUTH2)', () => {
  it('signs in with the token, and asks for a new one when it is refused', async () => {
    const received: string[] = [];
    const accepted = 'fresh';
    smtp = new SMTPServer({
      key,
      cert,
      logger: false,
      authMethods: ['XOAUTH2'],
      onAuth(auth, _session, callback) {
        if (auth.method === 'XOAUTH2' && auth.username === USER && auth.accessToken === accepted) {
          callback(null, { user: USER });
        } else {
          callback(null, { data: { status: '401', schemes: 'bearer' } });
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
    });
    await new Promise<void>((resolve) => smtp!.listen(0, '127.0.0.1', resolve));
    const port = (smtp.server.address() as AddressInfo).port;
    const renewals: boolean[] = [];
    mailer = openMailer(
      {
        host: 'localhost',
        port,
        security: 'starttls',
        username: USER,
        password: '',
        extraCa: cert,
        connectionTimeoutMs: 3000,
        oauth: { accessToken: 'stale', expiresAt: Date.now() + 3_600_000 },
      },
      (renew) => {
        renewals.push(renew);
        return Promise.resolve({ accessToken: accepted, expiresAt: Date.now() + 3_600_000 });
      },
    );
    await mailer.send(email('a@example.com'));
    expect(received).toHaveLength(1);
    expect(renewals).toContain(true);
  });
});
