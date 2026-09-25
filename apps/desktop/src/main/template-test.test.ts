import { createRepositories, openDatabase, type OpenedDatabase } from '@postloom/db';
import type { OutgoingEmail, SmtpAccountConfig } from '@postloom/email';
import { STARTER_GALLERY } from '@postloom/editor';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandlers } from './handlers';
import type { IpcHandlers } from './ipc-router';
import { fakeVault } from './test-fakes';

let opened: OpenedDatabase;
let handlers: IpcHandlers;
let send: ReturnType<
  typeof vi.fn<
    (
      config: SmtpAccountConfig,
      email: OutgoingEmail,
    ) => Promise<{ messageId: string; accepted: string[]; rejected: string[] }>
  >
>;

beforeEach(async () => {
  opened = await openDatabase({ file: ':memory:' });
  send = vi.fn(() => Promise.resolve({ messageId: '<1@test>', accepted: [], rejected: [] }));
  handlers = createHandlers({
    appInfo: { name: 'Postloom', version: '0.1.0', platform: 'linux' },
    repos: createRepositories(opened.db),
    vault: fakeVault(),
    smtp: { verify: () => Promise.resolve(), send },
  });
});
afterEach(async () => {
  await opened.close();
});

async function setUp() {
  const account = await handlers['accounts:create']({
    name: 'Office Gmail',
    provider: 'gmail',
    host: 'smtp.gmail.com',
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
    replyTo: 'accounts@example.com',
  });
  const reminder = STARTER_GALLERY.find((starter) => starter.id === 'paymentReminder');
  const template = await handlers['templates:create']({
    name: 'Payment reminder',
    subject: reminder?.subject ?? 'Reminder',
    document: reminder?.document,
  });
  return { account, sender, template };
}

describe('send a test of a template', () => {
  it('sends from the sender, to the account address, clearly marked as a test', async () => {
    const { sender, template } = await setUp();

    expect(await handlers['templates:sendTest']({ id: template.id, senderId: sender.id })).toEqual({
      sentTo: 'office@example.com',
    });

    const [config, email] = send.mock.calls[0] ?? [];
    expect(config?.password).toBe('app password');
    expect(email).toMatchObject({
      from: { name: 'Asha Kapoor', address: 'office@example.com' },
      replyTo: 'accounts@example.com',
      to: ['office@example.com'],
      subject: '[Test] A friendly reminder about your invoice',
    });
    // Personal details show as placeholders, never as personalisation code.
    expect(email?.html).toContain('[Invoice No]');
    expect(email?.html).not.toContain('{{');
  });

  it('can send to another address', async () => {
    const { sender, template } = await setUp();
    await handlers['templates:sendTest']({
      id: template.id,
      senderId: sender.id,
      to: 'friend@example.com',
    });
    expect(send.mock.calls[0]?.[1].to).toEqual(['friend@example.com']);
  });

  it('remembers the template’s usual sender', async () => {
    const { sender, template } = await setUp();
    const saved = await handlers['templates:save']({
      id: template.id,
      defaultSenderProfileId: sender.id,
    });
    expect(saved.defaultSenderProfileId).toBe(sender.id);
    expect((await handlers['templates:get']({ id: template.id })).defaultSenderProfileId).toBe(
      sender.id,
    );
  });
});
