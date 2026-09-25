import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockApi, renderWithProviders } from '../test/render';
import { SAMPLE_TEMPLATE, TemplatesPage } from './TemplatesPage';

describe('TemplatesPage', () => {
  it('renders the sample template in a sandboxed, script-free preview', async () => {
    const api = mockApi();
    renderWithProviders(<TemplatesPage />);

    const frame = await screen.findByTitle('Email preview');
    expect(api.templates.renderPreview).toHaveBeenCalledWith({ mjml: SAMPLE_TEMPLATE });
    expect(frame).toHaveAttribute('sandbox', '');
    expect(frame).toHaveAttribute('srcdoc', '<p>Hello</p>');
  });

  it('shows validation warnings', async () => {
    mockApi({
      templates: {
        renderPreview: vi.fn().mockResolvedValue({
          ok: true,
          data: { html: '<p/>', text: '', warnings: ['Attribute unknown-attr is illegal'] },
        }),
      },
    });
    renderWithProviders(<TemplatesPage />);

    expect(await screen.findByText('Attribute unknown-attr is illegal')).toBeInTheDocument();
  });

  it('explains errors in plain language', async () => {
    mockApi({
      templates: {
        renderPreview: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: 'TEMPLATE_INVALID', messageKey: 'errors.templateInvalid' },
        }),
      },
    });
    renderWithProviders(<TemplatesPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "This template couldn't be read. Check it for typing mistakes.",
    );
  });

  it('re-renders the preview when asked', async () => {
    const api = mockApi();
    renderWithProviders(<TemplatesPage />);
    await screen.findByTitle('Email preview');

    const source = screen.getByLabelText('Template source (MJML)');
    await userEvent.clear(source);
    await userEvent.type(source, '<mjml></mjml>');
    await userEvent.click(screen.getByRole('button', { name: 'Update preview' }));

    await waitFor(() =>
      expect(api.templates.renderPreview).toHaveBeenLastCalledWith({ mjml: '<mjml></mjml>' }),
    );
  });
});
