import { MantineProvider } from '@mantine/core';
import type { PostloomApi } from '@postloom/contracts';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { theme } from '../theme/theme';

export function mockApi(overrides: Partial<PostloomApi> = {}): PostloomApi {
  const api: PostloomApi = {
    app: {
      getInfo: vi.fn().mockResolvedValue({
        ok: true,
        data: { name: 'Postloom', version: '0.1.0', platform: 'linux' },
      }),
    },
    templates: {
      renderPreview: vi.fn().mockResolvedValue({
        ok: true,
        data: { html: '<p>Hello</p>', text: 'Hello', warnings: [] },
      }),
    },
    ...overrides,
  };
  window.postloom = api;
  return api;
}

export function renderWithProviders(ui: ReactElement, { route = '/' } = {}) {
  return render(
    <MantineProvider theme={theme}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </MantineProvider>,
  );
}
