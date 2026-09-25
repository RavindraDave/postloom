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
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]);
const fakeImage = {
  getSize: () => ({ width: 640, height: 200 }),
  resize: () => fakeImage,
  toPNG: () => PNG,
  toJPEG: () => PNG,
};
let send: ReturnType<
  typeof vi.fn<
    (
      config: SmtpAccountConfig,
      email: OutgoingEmail,
    ) => Promise<{ messageId: string; accepted: string[]; rejected: string[] }>
  >
>;

beforeEach(async () => {
  picked = { name: 'logo.png', bytes: PNG };
  opened = await openDatabase({ file: ':memory:' });
  send = vi.fn(() => Promise.resolve({ messageId: '<1@test>', accepted: [], rejected: [] }));
  repos = createRepositories(opened.db);
  handlers = createHandlers({
    appInfo: { name: 'Postloom', version: '0.1.0', platform: 'linux' },
    repos,
    vault: fakeVault(),
    smtp: { verify: () => Promise.resolve(), send },
    codec: { decode: () => fakeImage },
    pickImageFile: () => Promise.resolve(picked),
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

describe('pictures and brand looks', () => {
  it('stores a picked picture and never returns its bytes or path', async () => {
    const asset = await handlers['assets:pickImage'](undefined);
    expect(asset).toMatchObject({ mime: 'image/png', width: 640, height: 200, name: 'logo.png' });
    expect(JSON.stringify(asset)).not.toContain('bytes');
  });

  it('adds up picture sizes for the checklist', async () => {
    const asset = await handlers['assets:pickImage'](undefined);
    expect(
      await handlers['assets:totalSize']({ ids: [asset?.id ?? '', asset?.id ?? '', 'gone'] }),
    ).toEqual({ bytes: PNG.byteLength });
  });

  it('does nothing when the person cancels the file picker', async () => {
    picked = null;
    expect(await handlers['assets:pickImage'](undefined)).toBeNull();
  });

  it('gives a sender a brand look, and takes it away again', async () => {
    const { sender } = await setUp();
    const logo = await handlers['assets:pickImage'](undefined);

    const branded = await handlers['senders:setBrand']({
      id: sender.id,
      brand: {
        primaryColor: '#0E6B66',
        fontFamily: 'Georgia, Times, serif',
        logoAssetId: logo?.id ?? null,
      },
    });
    expect(branded.brand).toEqual({
      primaryColor: '#0E6B66',
      fontFamily: 'Georgia, Times, serif',
      logo: { assetId: logo?.id, width: 640, height: 200 },
    });

    // Changing it again updates the same kit.
    const recoloured = await handlers['senders:setBrand']({
      id: sender.id,
      brand: { primaryColor: '#222222', fontFamily: 'Georgia, Times, serif', logoAssetId: null },
    });
    expect(recoloured.brand).toMatchObject({ primaryColor: '#222222', logo: null });
    expect(await repos.brandKits.list()).toHaveLength(1);

    const plain = await handlers['senders:setBrand']({ id: sender.id, brand: null });
    expect(plain.brand).toBeNull();
  });

  it('refuses a logo that does not exist', async () => {
    const { sender } = await setUp();
    await expect(
      handlers['senders:setBrand']({
        id: sender.id,
        brand: {
          primaryColor: '#0E6B66',
          fontFamily: 'Georgia, Times, serif',
          logoAssetId: 'missing',
        },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('sends pictures and the logo inside the test email, in the sender’s look', async () => {
    const { sender, template } = await setUp();
    const logo = await handlers['assets:pickImage'](undefined);
    await handlers['senders:setBrand']({
      id: sender.id,
      brand: {
        primaryColor: '#0E6B66',
        fontFamily: 'Georgia, Times, serif',
        logoAssetId: logo?.id ?? null,
      },
    });
    await handlers['templates:save']({
      id: template.id,
      subject: 'Invoice {{Invoice No}} is due',
      document: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'See our new shop:' }] },
          { type: 'image', attrs: { assetId: logo?.id ?? '', alt: 'Shop', width: 400 } },
        ],
      },
    });

    await handlers['templates:sendTest']({ id: template.id, senderId: sender.id });
    const email = send.mock.calls[0]?.[1];
    expect(email?.subject).toBe('[Test] Invoice [Invoice No] is due');
    expect(email?.html).toContain(`cid:${logo?.id ?? ''}@postloom`);
    expect(email?.html).toContain('Georgia');
    // The same picture is attached once, even though it's used twice.
    expect(email?.inlineImages).toEqual([
      {
        cid: `${logo?.id ?? ''}@postloom`,
        contentType: 'image/png',
        content: PNG,
        filename: expect.stringMatching(/^picture-.+\.png$/) as unknown,
      },
    ]);
  });
});
