import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import {
  DEFAULT_PREFERENCES,
  type EmailAccountInfo,
  type IpcResult,
  type SendSummary,
  type SenderInfo,
  type PostloomApi,
  type TemplateDetail,
} from '@postloom/contracts';
import { STARTER_LETTER } from '@postloom/editor';
import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { createQueryClient } from '../App';
import { cssVariablesResolver, theme } from '../theme/theme';

export const ok = <T,>(data: T): Promise<IpcResult<T>> => Promise.resolve({ ok: true, data });

export const sampleTemplate: TemplateDetail = {
  id: 't1',
  name: 'Payment reminder',
  category: null,
  subject: 'Your invoice is due',
  editorMode: 'write',
  fields: ['First Name'],
  updatedAt: '2026-09-24T09:00:00.000Z',
  document: STARTER_LETTER,
  defaultSenderProfileId: null,
};

export const sampleAccount: EmailAccountInfo = {
  id: 'a1',
  name: 'Office Gmail',
  provider: 'gmail',
  host: 'smtp.gmail.com',
  port: 587,
  security: 'starttls',
  username: 'asha@example.com',
  hasPassword: true,
  dailyLimit: null,
  delayMs: null,
  lastTestedAt: '2026-09-24T09:41:00.000Z',
  lastTestOk: true,
  senderCount: 1,
};

export const sampleSender: SenderInfo = {
  id: 's1',
  name: 'Asha (Accounts)',
  emailAccountId: 'a1',
  fromName: 'Asha Kapoor',
  fromAddress: 'asha@example.com',
  replyTo: null,
  delayMs: null,
  templateCount: 0,
  brand: null,
  effective: {
    delayMs: { value: 2000, source: 'app' },
    dailyLimit: { value: 450, source: 'app' },
  },
};

export const SAMPLE_LIST = {
  token: '11111111-1111-4111-8111-111111111111',
  fileName: 'customers.xlsx',
  sheets: [{ name: 'Sheet1', rowCount: 3 }],
};

const sampleRows = [
  { rowNo: 2, cells: ['asha@example.com', 'Asha', 'INV-1'] },
  { rowNo: 3, cells: ['ben@example.com', 'Ben', 'INV-2'] },
  { rowNo: 4, cells: ['cara@example.com', 'Cara', 'INV-3'] },
];

export const sampleSend: SendSummary = {
  id: 'send1',
  status: 'sending',
  pauseReason: null,
  running: true,
  templateName: 'Payment reminder',
  senderName: 'Asha (Accounts)',
  accountName: 'Office Gmail',
  fileName: 'customers.xlsx',
  counts: { pending: 2, sending: 1, sent: 7, failed: 0, skipped: 0, uncertain: 0 },
  current: { rowNo: 9, to: 'ben@example.com' },
  etaMs: 150_000,
  createdAt: '2026-09-25T09:00:00.000Z',
  startedAt: '2026-09-25T09:00:01.000Z',
  finishedAt: null,
};

type DeepPartial<T> = { [K in keyof T]?: Partial<T[K]> };

/** Installs a fake `window.postloom`; every call resolves with sensible data. */
export function mockApi(overrides: DeepPartial<PostloomApi> = {}): PostloomApi {
  const api: PostloomApi = {
    app: {
      getInfo: vi.fn(() => ok({ name: 'Postloom', version: '0.1.0', platform: 'linux' as const })),
      getSecurity: vi.fn(() => ok({ secretProtection: 'keychain' as const })),
      exportDiagnostics: vi.fn(() =>
        ok({ saved: true, fileName: 'Postloom diagnostics 2026-09-25.json' }),
      ),
      updateStatus: vi.fn(() =>
        ok({
          state: 'upToDate' as const,
          latestVersion: null,
          checkedAt: '2026-09-25T09:00:00.000Z',
        }),
      ),
      openDownloadPage: vi.fn(() => ok({ ok: true as const })),
      ...overrides.app,
    },
    accounts: {
      list: vi.fn(() => ok([sampleAccount])),
      create: vi.fn((input: { name: string }) => ok({ ...sampleAccount, name: input.name })),
      update: vi.fn(() => ok(sampleAccount)),
      delete: vi.fn(() => ok({ ok: true as const })),
      testConnection: vi.fn(() => ok({ ok: true as const })),
      test: vi.fn(() => ok(sampleAccount)),
      sendTestEmail: vi.fn(() => ok({ sentTo: sampleAccount.username })),
      ...overrides.accounts,
    },
    senders: {
      list: vi.fn(() => ok([sampleSender])),
      create: vi.fn((input: { name: string }) => ok({ ...sampleSender, name: input.name })),
      update: vi.fn(() => ok(sampleSender)),
      delete: vi.fn(() => ok({ ok: true as const })),
      setBrand: vi.fn(() => ok(sampleSender)),
      ...overrides.senders,
    },
    assets: {
      pickImage: vi.fn(() =>
        ok({
          id: 'img1',
          mime: 'image/png',
          size: 2048,
          width: 800,
          height: 400,
          name: 'shop.png',
        }),
      ),
      totalSize: vi.fn(() => ok({ bytes: 0 })),
      ...overrides.assets,
    },
    recipients: {
      pick: vi.fn(() => ok(SAMPLE_LIST)),
      inspect: vi.fn(() =>
        ok({
          headers: ['Email', 'First Name', 'Invoice No'],
          sample: sampleRows,
          rowCount: 3,
          mapping: { to: 'Email', cc: null, bcc: null, enabled: null, attachments: null },
          fields: [{ name: 'First Name', hasFallback: false }],
          fieldMap: { 'First Name': 'First Name' },
        }),
      ),
      check: vi.fn(() =>
        ok({
          problems: [],
          toSendRows: [2, 3, 4],
          leftOut: { skipped: 0, disabled: 0, doNotEmail: 0, duplicate: 0 },
          dailyLimit: 450,
          remainingToday: 450,
          attachments: { files: 0, bytes: 0, outsideFolders: [] },
        }),
      ),
      row: vi.fn((input: { rowNo: number }) => {
        const row = sampleRows.find((r) => r.rowNo === input.rowNo) ?? sampleRows[0];
        return ok({
          rowNo: input.rowNo,
          to: [row?.cells[0] ?? ''],
          cc: [],
          bcc: [],
          values: { 'First Name': row?.cells[1] ?? '', 'Invoice No': row?.cells[2] ?? '' },
          attachments: [],
        });
      }),
      approveFolders: vi.fn(() => ok({ ok: true as const })),
      ...overrides.recipients,
    },
    sends: {
      start: vi.fn(() => ok(sampleSend)),
      get: vi.fn(() => ok(sampleSend)),
      list: vi.fn(() => ok([])),
      pause: vi.fn(() => ok(sampleSend)),
      resume: vi.fn(() => ok(sampleSend)),
      stop: vi.fn(() => ok(sampleSend)),
      retryFailed: vi.fn(() => ok(sampleSend)),
      resolveUncertain: vi.fn(() => ok(sampleSend)),
      problems: vi.fn(() => ok([])),
      exportReport: vi.fn(() => ok({ saved: true, fileName: 'Payment reminder 2026-09-25.csv' })),
      ...overrides.sends,
    },
    data: {
      backups: vi.fn(() =>
        ok([
          {
            fileName: 'postloom-daily-2026-09-25.sqlite',
            kind: 'daily',
            createdAt: '2026-09-25T08:00:00.000Z',
            sizeBytes: 1_258_291,
          },
        ]),
      ),
      backupNow: vi.fn(() =>
        ok({
          fileName: 'postloom-manual-2026-09-25.sqlite',
          kind: 'manual',
          createdAt: '2026-09-25T11:00:00.000Z',
          sizeBytes: 1_258_291,
        }),
      ),
      restore: vi.fn(() => ok({ ok: true as const })),
      openFolder: vi.fn(() => ok({ ok: true as const })),
      clearHistory: vi.fn(() => ok({ deleted: 3 })),
      ...overrides.data,
    },
    settings: {
      get: vi.fn(() => ok(DEFAULT_PREFERENCES)),
      update: vi.fn((changes) => ok({ ...DEFAULT_PREFERENCES, ...changes })),
      ...overrides.settings,
    },
    templates: {
      renderPreview: vi.fn(() => ok({ html: '<p>Hello</p>', text: 'Hello', warnings: [] })),
      list: vi.fn(() => ok([sampleTemplate])),
      get: vi.fn(() => ok(sampleTemplate)),
      create: vi.fn((input: { name: string }) =>
        ok({ ...sampleTemplate, id: 't2', name: input.name }),
      ),
      save: vi.fn(() => ok(sampleTemplate)),
      delete: vi.fn(() => ok({ ok: true as const })),
      restore: vi.fn(() => ok({ ok: true as const })),
      versions: vi.fn(() => ok([])),
      restoreVersion: vi.fn(() => ok(sampleTemplate)),
      sendTest: vi.fn(() => ok({ sentTo: 'asha@example.com' })),
      pickHtml: vi.fn(() => ok(null)),
      ...overrides.templates,
    },
  };
  window.postloom = api;
  return api;
}

export function renderWithProviders(ui: ReactElement, { route = '/' } = {}) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver} env="test">
        <Notifications />
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>,
  );
}
