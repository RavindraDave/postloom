import { DEFAULT_PREFERENCES } from '@postloom/contracts';
import { createRepositories, openDatabase, type OpenedDatabase } from '@postloom/db';
import { STARTER_LETTER } from '@postloom/editor';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BLANK_LETTER, createHandlers } from './handlers';
import type { IpcHandlers } from './ipc-router';
import { fakeVault } from './test-fakes';

let opened: OpenedDatabase;
let handlers: IpcHandlers;
let repos: ReturnType<typeof createRepositories>;

beforeEach(async () => {
  opened = await openDatabase({ file: ':memory:' });
  repos = createRepositories(opened.db);
  handlers = createHandlers({
    appInfo: { name: 'Postloom', version: '0.1.0', platform: 'linux' },
    repos,
    vault: fakeVault(),
  });
});
afterEach(async () => {
  await opened.close();
});

describe('preferences', () => {
  it('starts from the defaults and saves changes', async () => {
    expect(await handlers['settings:get'](undefined)).toEqual(DEFAULT_PREFERENCES);

    const updated = await handlers['settings:update']({ colorScheme: 'dark' });
    expect(updated).toEqual({ ...DEFAULT_PREFERENCES, colorScheme: 'dark' });
    expect(await handlers['settings:get'](undefined)).toEqual(updated);
  });

  it('ignores stored values that are no longer valid', async () => {
    await repos.settings.set('preferences', { colorScheme: 'purple', textScale: 1.15 });
    expect(await handlers['settings:get'](undefined)).toEqual(DEFAULT_PREFERENCES);
  });
});

describe('templates', () => {
  it('creates a template from a blank letter and lists the details it uses', async () => {
    const blank = await handlers['templates:create']({ name: 'Blank', subject: 'Hi' });
    expect(blank.document).toEqual(BLANK_LETTER);
    expect(blank.fields).toEqual([]);

    const starter = await handlers['templates:create']({
      name: 'Starter',
      subject: 'Hello',
      document: STARTER_LETTER,
    });
    expect(starter.fields).toEqual(['First Name']);

    const list = await handlers['templates:list'](undefined);
    expect(list.map((t) => t.name)).toEqual(['Starter', 'Blank']);
  });

  it('keeps versions on manual saves and restores them', async () => {
    const created = await handlers['templates:create']({ name: 'Reminder', subject: 'v1' });
    await handlers['templates:save']({ id: created.id, subject: 'autosaved' });
    await handlers['templates:save']({ id: created.id, subject: 'v2', snapshot: true });

    const versions = await handlers['templates:versions']({ id: created.id });
    expect(versions.map((v) => [v.versionNo, v.subject])).toEqual([
      [2, 'v2'],
      [1, 'v1'],
    ]);

    const restored = await handlers['templates:restoreVersion']({ id: created.id, versionNo: 1 });
    expect(restored.subject).toBe('v1');
  });

  it('moves templates to the bin and back', async () => {
    const created = await handlers['templates:create']({ name: 'Reminder', subject: 'v1' });
    await handlers['templates:delete']({ id: created.id });
    expect(await handlers['templates:list'](undefined)).toEqual([]);

    await handlers['templates:restore']({ id: created.id });
    expect(await handlers['templates:list'](undefined)).toHaveLength(1);
  });

  it('refuses to open a stored document that is no longer valid', async () => {
    const template = await repos.templates.create({
      name: 'Tampered',
      category: null,
      subject: 'x',
      editorMode: 'write',
      document: { type: 'doc', content: [{ type: 'iframe' }] },
      documentVersion: 1,
      defaultSenderProfileId: null,
    });

    await expect(handlers['templates:get']({ id: template.id })).rejects.toMatchObject({
      code: 'TEMPLATE_INVALID',
    });
    const [summary] = await handlers['templates:list'](undefined);
    expect(summary?.fields).toEqual([]);
  });

  it('compiles previews', async () => {
    const preview = await handlers['templates:renderPreview']({
      mjml: '<mjml><mj-body><mj-section><mj-column><mj-text>Hi</mj-text></mj-column></mj-section></mj-body></mjml>',
    });
    expect(preview.html).toContain('Hi');
  });
});
