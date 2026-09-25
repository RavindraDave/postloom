import { createRepositories, openDatabase, type OpenedDatabase } from '@postloom/db';
import type { OutgoingEmail, SmtpAccountConfig } from '@postloom/email';
import { AppError } from '@postloom/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAccountHandlers } from './accounts';
import { fakeVault } from './test-fakes';

let opened: OpenedDatabase;
let repos: ReturnType<typeof createRepositories>;
let verify: ReturnType<typeof vi.fn<(config: SmtpAccountConfig) => Promise<void>>>;
let send: ReturnType<
  typeof vi.fn<
    (
      config: SmtpAccountConfig,
      email: OutgoingEmail,
    ) => Promise<{
      messageId: string;
      accepted: string[];
      rejected: string[];
    }>
  >
>;
let handlers: ReturnType<typeof createAccountHandlers>;

const gmail = {
  name: 'Office Gmail',
  provider: 'gmail' as const,
  host: 'smtp.gmail.com',
  port: 587,
  security: 'starttls' as const,
  username: 'office@example.com',
  password: 'abcd efgh ijkl mnop',
};

beforeEach(async () => {
  opened = await openDatabase({ file: ':memory:' });
  repos = createRepositories(opened.db);
  verify = vi.fn(() => Promise.resolve());
  send = vi.fn(() => Promise.resolve({ messageId: '<1@test>', accepted: [], rejected: [] }));
  handlers = createAccountHandlers({
    repos,
    vault: fakeVault(),
    extraCa: 'TEST-CA',
    smtp: { verify, send },
  });
});
afterEach(async () => {
  await opened.close();
});

describe('email accounts', () => {
  it('saves an account without ever returning the password', async () => {
    const account = await handlers['accounts:create'](gmail);

    expect(account).toMatchObject({ name: 'Office Gmail', hasPassword: true, senderCount: 0 });
    expect(JSON.stringify(account)).not.toContain('abcd');
    expect(JSON.stringify(await handlers['accounts:list'](undefined))).not.toContain('abcd');
    // Stored encrypted, not as plain text.
    const cipher = await repos.accounts.getSecret(account.id);
    expect(new TextDecoder().decode(cipher ?? new Uint8Array())).toBe(`sealed:${gmail.password}`);
  });

  it('tests a connection before saving, trusting the extra CA', async () => {
    const { host, port, security, username, password } = gmail;
    const connection = { host, port, security, username, password };
    await handlers['accounts:testConnection'](connection);
    expect(verify).toHaveBeenCalledWith({ ...connection, extraCa: 'TEST-CA' });
  });

  it('records the result of testing a saved account', async () => {
    const { id } = await handlers['accounts:create'](gmail);

    const ok = await handlers['accounts:test']({ id });
    expect(ok.lastTestOk).toBe(true);
    expect(verify).toHaveBeenLastCalledWith(
      expect.objectContaining({ password: gmail.password, extraCa: 'TEST-CA' }),
    );

    verify.mockRejectedValueOnce(
      new AppError({ code: 'EMAIL_AUTH_FAILED', messageKey: 'errors.emailAuthFailed' }),
    );
    await expect(handlers['accounts:test']({ id })).rejects.toMatchObject({
      code: 'EMAIL_AUTH_FAILED',
    });
    expect((await repos.accounts.get(id)).lastTestOk).toBe(false);
  });

  it('changes the password only when a new one is given', async () => {
    const { id } = await handlers['accounts:create'](gmail);
    await handlers['accounts:update']({ id, name: 'Main Gmail' });
    await handlers['accounts:test']({ id });
    expect(verify).toHaveBeenLastCalledWith(expect.objectContaining({ password: gmail.password }));

    const updated = await handlers['accounts:update']({ id, password: 'new pass' });
    expect(updated.name).toBe('Main Gmail');
    await handlers['accounts:test']({ id });
    expect(verify).toHaveBeenLastCalledWith(expect.objectContaining({ password: 'new pass' }));
  });

  it('sends a test email to the account itself by default', async () => {
    const { id } = await handlers['accounts:create'](gmail);

    expect(await handlers['accounts:sendTestEmail']({ id })).toEqual({
      sentTo: 'office@example.com',
    });
    const [, email] = send.mock.calls[0] ?? [];
    expect(email).toMatchObject({
      to: ['office@example.com'],
      subject: 'Postloom test email',
      from: { address: 'office@example.com' },
    });
    expect(email?.html).toContain('It works!');
    expect(email?.text).toContain('It works!');

    await handlers['accounts:sendTestEmail']({ id, to: 'friend@example.com' });
    expect(send.mock.calls[1]?.[1].to).toEqual(['friend@example.com']);
  });

  it('explains when the saved password is missing', async () => {
    const account = await repos.accounts.create({
      name: 'No password',
      provider: 'other',
      host: 'mail.example.com',
      port: 465,
      security: 'tls',
      username: 'me@example.com',
      dailyLimit: null,
      delayMs: null,
    });
    await expect(handlers['accounts:test']({ id: account.id })).rejects.toMatchObject({
      messageKey: 'errors.passwordMissing',
    });
  });

  it('reports how passwords are protected', async () => {
    expect(await handlers['app:getSecurity'](undefined)).toEqual({ secretProtection: 'keychain' });
  });

  it('refuses to delete an account that senders still use', async () => {
    const { id } = await handlers['accounts:create'](gmail);
    await handlers['senders:create']({
      name: 'Ravi at the office',
      emailAccountId: id,
      fromName: 'Ravi',
      fromAddress: 'office@example.com',
    });
    expect((await handlers['accounts:list'](undefined))[0]?.senderCount).toBe(1);
    await expect(handlers['accounts:delete']({ id })).rejects.toMatchObject({ code: 'IN_USE' });
  });
});

describe('senders', () => {
  it('inherits delay and daily limit, and says where they come from', async () => {
    const account = await handlers['accounts:create'](gmail);
    const sender = await handlers['senders:create']({
      name: 'Newsletter',
      emailAccountId: account.id,
      fromName: 'Club News',
      fromAddress: 'office@example.com',
    });

    expect(sender.effective).toEqual({
      delayMs: { value: 2000, source: 'app' },
      dailyLimit: { value: 450, source: 'app' },
    });

    await handlers['accounts:update']({ id: account.id, delayMs: 5000, dailyLimit: 100 });
    const [fromAccount] = await handlers['senders:list'](undefined);
    expect(fromAccount?.effective).toEqual({
      delayMs: { value: 5000, source: 'account' },
      dailyLimit: { value: 100, source: 'account' },
    });

    const own = await handlers['senders:update']({ id: sender.id, delayMs: 8000 });
    expect(own.effective.delayMs).toEqual({ value: 8000, source: 'sender' });
    expect(own.templateCount).toBe(0);
  });

  it('uses a stricter provider limit over the app default', async () => {
    const account = await handlers['accounts:create']({
      ...gmail,
      provider: 'outlook',
      host: 'smtp-mail.outlook.com',
    });
    const sender = await handlers['senders:create']({
      name: 'Outlook',
      emailAccountId: account.id,
      fromName: 'Me',
      fromAddress: 'office@example.com',
      replyTo: 'replies@example.com',
    });
    expect(sender.effective.dailyLimit).toEqual({ value: 300, source: 'provider' });
    expect(sender.replyTo).toBe('replies@example.com');
  });

  it('deletes a sender', async () => {
    const account = await handlers['accounts:create'](gmail);
    const sender = await handlers['senders:create']({
      name: 'Temp',
      emailAccountId: account.id,
      fromName: 'Me',
      fromAddress: 'office@example.com',
    });
    await handlers['senders:delete']({ id: sender.id });
    expect(await handlers['senders:list'](undefined)).toEqual([]);
    await handlers['accounts:delete']({ id: account.id });
    expect(await handlers['accounts:list'](undefined)).toEqual([]);
  });
});
