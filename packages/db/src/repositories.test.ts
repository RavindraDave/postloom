import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type OpenedDatabase } from './open';
import { createRepositories, MAX_TEMPLATE_VERSIONS, type Repositories } from './repositories';
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

const gmail = {
  name: 'Office Gmail',
  provider: 'gmail' as const,
  host: 'smtp.gmail.com',
  port: 587,
  security: 'starttls' as const,
  username: 'asha@brightlane.example',
  dailyLimit: 450,
  delayMs: null,
};

async function makeSender(accountId: string) {
  return repos.senders.create({
    name: 'Asha (Accounts)',
    emailAccountId: accountId,
    fromName: 'Asha',
    fromAddress: 'asha@brightlane.example',
    replyTo: 'accounts@brightlane.example',
    defaultCc: null,
    defaultBcc: null,
    brandKitId: null,
    delayMs: null,
  });
}

const letter = { type: 'doc', content: [{ type: 'paragraph' }] };

describe('settings', () => {
  it('returns the fallback until a value is saved, then the value', async () => {
    expect(await repos.settings.get('theme', 'auto')).toBe('auto');
    await repos.settings.set('theme', 'dark');
    await repos.settings.set('textScale', 1.1);
    expect(await repos.settings.get('theme', 'auto')).toBe('dark');
    expect(await repos.settings.all()).toEqual({ theme: 'dark', textScale: 1.1 });
  });
});

describe('email accounts', () => {
  it('creates, updates and lists accounts', async () => {
    const account = await repos.accounts.create(gmail);
    expect(account).toMatchObject({ ...gmail, hasSecret: false, lastTestOk: null });

    const updated = await repos.accounts.update(account.id, {
      dailyLimit: 300,
      name: 'Work Gmail',
    });
    expect(updated.dailyLimit).toBe(300);
    expect(updated.updatedAt > account.updatedAt).toBe(true);
    expect((await repos.accounts.list()).map((a) => a.name)).toEqual(['Work Gmail']);
  });

  it('keeps the encrypted password out of the account object', async () => {
    const account = await repos.accounts.create(gmail);
    await repos.accounts.setSecret(account.id, new Uint8Array([9, 8, 7]));

    const loaded = await repos.accounts.get(account.id);
    expect(loaded.hasSecret).toBe(true);
    expect(JSON.stringify(loaded)).not.toContain('secret');
    expect(Array.from((await repos.accounts.getSecret(account.id)) ?? [])).toEqual([9, 8, 7]);

    await repos.accounts.setSecret(account.id, null);
    expect((await repos.accounts.get(account.id)).hasSecret).toBe(false);
  });

  it('records connection tests', async () => {
    const account = await repos.accounts.create(gmail);
    await repos.accounts.recordTest(account.id, true);
    const loaded = await repos.accounts.get(account.id);
    expect(loaded.lastTestOk).toBe(true);
    expect(loaded.lastTestedAt).not.toBeNull();
  });

  it('will not delete an account a sender still uses', async () => {
    const account = await repos.accounts.create(gmail);
    await makeSender(account.id);

    await expect(repos.accounts.delete(account.id)).rejects.toMatchObject({ code: 'IN_USE' });
  });

  it('reports missing accounts clearly', async () => {
    await expect(repos.accounts.get('nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(repos.accounts.update('nope', { name: 'x' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(repos.accounts.setSecret('nope', null)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(repos.accounts.getSecret('nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('senders and brand kits', () => {
  it('links a sender to an account and a brand kit', async () => {
    const account = await repos.accounts.create(gmail);
    const kit = await repos.brandKits.create({
      name: 'Brightlane',
      primaryColor: '#2F5D8C',
      secondaryColor: null,
      fontFamily: 'Arial, sans-serif',
      logoAssetId: null,
      footerText: 'Brightlane Ltd',
    });
    const sender = await makeSender(account.id);

    const updated = await repos.senders.update(sender.id, { brandKitId: kit.id, delayMs: 3000 });
    expect(updated).toMatchObject({ brandKitId: kit.id, delayMs: 3000 });

    await repos.brandKits.delete(kit.id);
    expect((await repos.senders.get(sender.id)).brandKitId).toBeNull();
  });

  it('refuses a sender for an account that does not exist', async () => {
    await expect(makeSender('missing')).rejects.toMatchObject({ code: 'IN_USE' });
  });

  it('counts the templates that use a sender', async () => {
    const sender = await makeSender((await repos.accounts.create(gmail)).id);
    for (const name of ['Invoice', 'Reminder']) {
      await repos.templates.create({
        name,
        category: null,
        subject: 'Hi',
        editorMode: 'write',
        document: letter,
        documentVersion: 1,
        defaultSenderProfileId: sender.id,
      });
    }
    expect(await repos.senders.templateCount(sender.id)).toBe(2);

    await repos.senders.delete(sender.id);
    const templates = await repos.templates.list();
    expect(templates.every((t) => t.defaultSenderProfileId === null)).toBe(true);
  });

  it('updates and lists brand kits', async () => {
    const kit = await repos.brandKits.create({
      name: 'B',
      primaryColor: '#000000',
      secondaryColor: null,
      fontFamily: 'Arial',
      logoAssetId: null,
      footerText: null,
    });
    await repos.brandKits.update(kit.id, { primaryColor: '#2E6B4F', name: 'Green' });
    expect((await repos.brandKits.list()).map((k) => [k.name, k.primaryColor])).toEqual([
      ['Green', '#2E6B4F'],
    ]);
    await expect(repos.brandKits.update('nope', {})).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('templates', () => {
  async function makeTemplate() {
    return repos.templates.create({
      name: 'Payment reminder',
      category: 'Invoices',
      subject: 'Reminder v1',
      editorMode: 'write',
      document: letter,
      documentVersion: 1,
      defaultSenderProfileId: null,
    });
  }

  it('stores the editor document and starts with version 1', async () => {
    const template = await makeTemplate();
    expect(template.document).toEqual(letter);
    expect((await repos.templates.versions(template.id)).map((v) => v.versionNo)).toEqual([1]);
  });

  it('autosaves without creating versions, and snapshots on manual save', async () => {
    const template = await makeTemplate();
    await repos.templates.update(template.id, { subject: 'draft' });
    await repos.templates.update(
      template.id,
      { subject: 'Reminder v2' },
      { snapshot: true, note: 'Saved' },
    );

    const versions = await repos.templates.versions(template.id);
    expect(versions.map((v) => [v.versionNo, v.subject, v.note])).toEqual([
      [2, 'Reminder v2', 'Saved'],
      [1, 'Reminder v1', null],
    ]);
  });

  it(`keeps only the newest ${MAX_TEMPLATE_VERSIONS} versions`, async () => {
    const template = await makeTemplate();
    for (let i = 2; i <= MAX_TEMPLATE_VERSIONS + 5; i++) {
      await repos.templates.update(template.id, { subject: `v${i}` }, { snapshot: true });
    }
    const versions = await repos.templates.versions(template.id);
    expect(versions).toHaveLength(MAX_TEMPLATE_VERSIONS);
    expect(versions[0]!.versionNo).toBe(MAX_TEMPLATE_VERSIONS + 5);
    expect(versions.at(-1)!.versionNo).toBe(6);
  });

  it('restores an earlier version as a new version', async () => {
    const template = await makeTemplate();
    await repos.templates.update(template.id, { subject: 'Oops' }, { snapshot: true });

    const restored = await repos.templates.restoreVersion(template.id, 1);
    expect(restored.subject).toBe('Reminder v1');
    const versions = await repos.templates.versions(template.id);
    expect(versions[0]).toMatchObject({ versionNo: 3, note: 'Restored version 1' });
    await expect(repos.templates.restoreVersion(template.id, 99)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('moves templates to the bin and back', async () => {
    const template = await makeTemplate();
    await repos.templates.softDelete(template.id);
    expect(await repos.templates.list()).toEqual([]);
    await expect(repos.templates.update(template.id, { name: 'x' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    await repos.templates.restore(template.id);
    expect((await repos.templates.list()).map((t) => t.name)).toEqual(['Payment reminder']);
  });

  it('lists the most recently changed first', async () => {
    const a = await makeTemplate();
    await repos.templates.create({ ...a, name: 'Newer' });
    await repos.templates.update(a.id, { name: 'Edited' });

    expect((await repos.templates.list()).map((t) => t.name)).toEqual(['Edited', 'Newer']);
  });
});

describe('"Do not email" list', () => {
  it('matches addresses regardless of case and spaces', async () => {
    await repos.suppression.add(' Rahul.Mehta@Example.com ', 'Asked not to be emailed');
    await repos.suppression.add('rahul.mehta@example.com', 'duplicate is ignored');

    expect(await repos.suppression.has('RAHUL.MEHTA@example.COM')).toBe(true);
    expect(await repos.suppression.list()).toEqual([
      expect.objectContaining({
        email: 'rahul.mehta@example.com',
        reason: 'Asked not to be emailed',
      }),
    ]);

    await repos.suppression.remove('Rahul.Mehta@example.com');
    expect(await repos.suppression.has('rahul.mehta@example.com')).toBe(false);
  });
});
