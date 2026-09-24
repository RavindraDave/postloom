import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockApi, ok, renderWithProviders, sampleTemplate } from '../test/render';
import { TemplatesPage } from './TemplatesPage';

describe('TemplatesPage', () => {
  it('explains what a template is when there are none', async () => {
    mockApi({ templates: { list: vi.fn(() => ok([])) } });
    renderWithProviders(<TemplatesPage />);

    expect(await screen.findByText('No templates yet')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'New template' })).toHaveLength(2);
  });

  it('shows the most recent template with its details and a sandboxed preview', async () => {
    const api = mockApi();
    renderWithProviders(<TemplatesPage />);

    const list = await screen.findByRole('navigation', { name: 'Your templates' });
    expect(within(list).getByRole('button', { name: /Payment reminder/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(await screen.findByText('First Name')).toBeInTheDocument();

    const frame = await screen.findByTitle('Email preview');
    expect(frame).toHaveAttribute('sandbox', '');
    expect(frame).toHaveAttribute('srcdoc', '<p>Hello</p>');
    expect(api.templates.renderPreview).toHaveBeenCalledWith({
      mjml: expect.stringContaining('Dear [First Name],') as string,
    });
  });

  it('asks for a name before making a template', async () => {
    const api = mockApi();
    renderWithProviders(<TemplatesPage />);

    await userEvent.click((await screen.findAllByRole('button', { name: 'New template' }))[0]!);
    await userEvent.click(await screen.findByRole('button', { name: 'Make template' }));

    expect(await screen.findByText('Give your template a name first.')).toBeInTheDocument();
    expect(api.templates.create).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/Name/), 'Thank you note');
    await userEvent.click(screen.getByRole('button', { name: 'Make template' }));

    await waitFor(() => {
      expect(api.templates.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Thank you note', subject: 'A note from us' }),
      );
    });
  });

  it('moves a template to the bin with an undo', async () => {
    const api = mockApi();
    renderWithProviders(<TemplatesPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Move to bin' }));

    expect(await screen.findByText('“Payment reminder” moved to the bin')).toBeInTheDocument();
    expect(api.templates.delete).toHaveBeenCalledWith({ id: sampleTemplate.id });

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(api.templates.restore).toHaveBeenCalledWith({ id: sampleTemplate.id });
    });
  });

  it('explains errors in plain language', async () => {
    mockApi({
      templates: {
        list: vi.fn(() =>
          Promise.resolve({
            ok: false as const,
            error: { code: 'UNEXPECTED' as const, messageKey: 'errors.unexpected' },
          }),
        ),
      },
    });
    renderWithProviders(<TemplatesPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
  });
});
