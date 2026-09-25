import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { mockApi, renderWithProviders } from '../test/render';
import { TemplateEditorPage } from './TemplateEditorPage';

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/templates/:id" element={<TemplateEditorPage />} />
    </Routes>,
    { route: '/templates/t1' },
  );
}

describe('TemplateEditorPage', () => {
  it('opens the template from the address', async () => {
    const api = mockApi();
    renderPage();

    expect(await screen.findByRole('textbox', { name: 'Template name' })).toHaveValue(
      'Payment reminder',
    );
    expect(api.templates.get).toHaveBeenCalledWith({ id: 't1' });
  });

  it('explains when a template cannot be opened', async () => {
    mockApi({
      templates: {
        get: vi.fn(() =>
          Promise.resolve({
            ok: false as const,
            error: { code: 'NOT_FOUND' as const, messageKey: 'errors.notFound' },
          }),
        ),
      },
    });
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("This template couldn't be opened.");
    expect(alert).toHaveTextContent(/It may have been deleted/);
  });
});
