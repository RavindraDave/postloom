import { createRepositories, openDatabase, type OpenedDatabase } from '@postloom/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHandlers } from './handlers';
import type { IpcHandlers } from './ipc-router';
import { fakeVault } from './test-fakes';

let opened: OpenedDatabase;
let handlers: IpcHandlers;
let repos: ReturnType<typeof createRepositories>;
let saved: { name: string; content: string } | null;

beforeEach(async () => {
  opened = await openDatabase({ file: ':memory:' });
  repos = createRepositories(opened.db);
  saved = null;
  handlers = createHandlers({
    appInfo: { name: 'Postloom', version: '0.1.0', platform: 'linux' },
    repos,
    vault: fakeVault(),
    smtp: { verify: () => Promise.resolve(), send: () => Promise.reject(new Error('unused')) },
    saveFile: (name, content) => {
      saved = { name, content };
      return Promise.resolve(name);
    },
  });
});
afterEach(async () => {
  await opened.close();
});

describe('diagnostics', () => {
  it('describes the set-up without any passwords, addresses, servers or content', async () => {
    const account = await handlers['accounts:create']({
      name: 'Private Office',
      provider: 'other',
      host: 'smtp.secret-company.example',
      port: 587,
      security: 'starttls',
      username: 'asha@secret-company.example',
      password: 'hunter2-app-password',
    });
    const sender = await handlers['senders:create']({
      name: 'Asha Private',
      emailAccountId: account.id,
      fromName: 'Asha Kapoor',
      fromAddress: 'asha@secret-company.example',
    });
    const template = await handlers['templates:create']({
      name: 'Confidential offer',
      subject: 'Your confidential offer',
    });
    const version = await repos.templates.snapshot(template.id, 'Sent');
    const send = await repos.sends.create({
      templateId: template.id,
      templateVersionId: version.id,
      senderProfileId: sender.id,
      emailAccountId: account.id,
      settings: { delayMs: 2000, dailyLimit: 450 },
      sourceFileName: 'secret-customers.xlsx',
      sourceFileSha256: 'x',
      mapping: {},
      recipients: [
        {
          rowNo: 2,
          to: ['vip@private.example'],
          cc: [],
          bcc: [],
          values: { Name: 'Very Private' },
        },
      ],
    });
    const [person] = await repos.sends.recipients(send.id);
    await repos.sends.claim(person!.id);
    await repos.sends.markFailed(person!.id, 'rejected:550');
    await repos.sends.setStatus(send.id, 'finished');

    expect(await handlers['app:exportDiagnostics'](undefined)).toEqual({
      saved: true,
      fileName: expect.stringMatching(/^Postloom diagnostics \d{4}-\d{2}-\d{2}\.json$/) as unknown,
    });
    const text = saved?.content ?? '';
    for (const secret of [
      'hunter2',
      'secret-company',
      'private.example',
      'Very Private',
      'Confidential',
      'secret-customers',
      'Asha',
    ]) {
      expect(text, secret).not.toContain(secret);
    }
    const diagnostics = JSON.parse(text) as Record<string, unknown>;
    expect(diagnostics).toMatchObject({
      app: { version: '0.1.0' },
      passwordStore: 'keychain',
      accounts: { count: 1, byProvider: { other: 1 }, withPassword: 1 },
      senders: 1,
      templates: 1,
      sends: {
        count: 1,
        byStatus: { finished: 1 },
        recent: [{ status: 'finished', people: { failed: 1 }, problems: { 'rejected:550': 1 } }],
      },
    });
  });
});
