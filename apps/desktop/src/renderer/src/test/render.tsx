import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import {
  DEFAULT_PREFERENCES,
  type IpcResult,
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

type DeepPartial<T> = { [K in keyof T]?: Partial<T[K]> };

/** Installs a fake `window.postloom`; every call resolves with sensible data. */
export function mockApi(overrides: DeepPartial<PostloomApi> = {}): PostloomApi {
  const api: PostloomApi = {
    app: {
      getInfo: vi.fn(() => ok({ name: 'Postloom', version: '0.1.0', platform: 'linux' as const })),
      ...overrides.app,
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
      ...overrides.templates,
    },
  };
  window.postloom = api;
  return api;
}

export function renderWithProviders(ui: ReactElement, { route = '/' } = {}) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
        <Notifications />
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>,
  );
}
