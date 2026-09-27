import { STARTER_GALLERY } from '@postloom/editor';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockApi, ok, renderWithProviders, sampleTemplate } from '../test/render';
import { TemplateEditor } from './TemplateEditor';

const designTemplate = { ...sampleTemplate, editorMode: 'design' as const };

function lastSavedDocument(api: ReturnType<typeof mockApi>) {
  const calls = vi.mocked(api.templates.save).mock.calls;
  for (let i = calls.length - 1; i >= 0; i -= 1) {
    const document = calls[i]?.[0].document;
    if (document) return document;
  }
  return undefined;
}

describe('Design mode', () => {
  it('switches to Design and remembers it', async () => {
    const api = mockApi();
    renderWithProviders(<TemplateEditor template={sampleTemplate} />);

    await userEvent.click(screen.getByRole('button', { name: 'Switch to Design' }));
    await waitFor(() => {
      expect(api.templates.save).toHaveBeenCalledWith({ id: 't1', editorMode: 'design' });
    });
    expect(screen.getByRole('button', { name: 'Add block' })).toBeInTheDocument();
  });

  it('adds two columns', async () => {
    const api = mockApi();
    renderWithProviders(<TemplateEditor template={designTemplate} />);

    await userEvent.click(screen.getByRole('button', { name: 'Add block' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Two columns' }));

    await waitFor(
      () => {
        expect(lastSavedDocument(api)?.content.some((block) => block.type === 'columns')).toBe(
          true,
        );
      },
      { timeout: 3000 },
    );
  });

  it('adds a table and grows it', async () => {
    const api = mockApi();
    renderWithProviders(<TemplateEditor template={designTemplate} />);

    await userEvent.click(screen.getByRole('button', { name: 'Add block' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Table' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Add row' }));
    await userEvent.click(screen.getByRole('button', { name: 'Stripes' }));

    await waitFor(
      () => {
        const table = lastSavedDocument(api)?.content.find((block) => block.type === 'table');
        expect(table).toMatchObject({ type: 'table', attrs: { striped: true } });
        expect(table?.type === 'table' ? table.content : []).toHaveLength(4);
      },
      { timeout: 3000 },
    );
  });

  it('adds a part shown only to some people, with its rule written out', async () => {
    const api = mockApi();
    renderWithProviders(<TemplateEditor template={designTemplate} />);

    await userEvent.click(screen.getByRole('button', { name: 'Add block' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Show only if…' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Show this part only to some people',
    });
    const field = within(dialog).getByRole('combobox', { name: /^Detail/ });
    await userEvent.clear(field);
    await userEvent.type(field, 'Plan');
    await userEvent.click(within(dialog).getByRole('combobox', { name: /Show it when/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'is exactly' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add part' }));
    expect(within(dialog).getByText('Enter the value to compare with.')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(/Value/), 'Gold');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add part' }));

    expect(await screen.findByText('Shown only if Plan is exactly “Gold”')).toBeInTheDocument();
    await waitFor(
      () => {
        expect(lastSavedDocument(api)?.content).toContainEqual(
          expect.objectContaining({
            type: 'conditional',
            attrs: { field: 'Plan', op: 'equals', value: 'Gold' },
          }),
        );
      },
      { timeout: 3000 },
    );
  });

  it('explains why a design can’t go back to Write mode', async () => {
    mockApi();
    const newsletter = STARTER_GALLERY.find((starter) => starter.id === 'newsletter');
    renderWithProviders(
      <TemplateEditor
        template={{
          ...designTemplate,
          document: {
            type: 'doc',
            content: [
              ...(newsletter?.document.content ?? []),
              { type: 'spacer', attrs: { height: 24 } },
            ],
          },
        }}
      />,
    );

    await userEvent.click(screen.getByRole('radio', { name: 'Write' }));
    expect(await screen.findByText(/Remove them to go back to Write mode/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Design' })).toBeChecked();
  });

  it('previews with example details, deciding show-only-if parts', async () => {
    const api = mockApi();
    renderWithProviders(<TemplateEditor template={sampleTemplate} />);

    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    const dialog = await screen.findByRole('dialog', { name: 'How it will look' });
    await userEvent.type(within(dialog).getByLabelText('First Name'), 'Rahul');

    await waitFor(() => {
      expect(api.templates.renderPreview).toHaveBeenCalledWith({
        mjml: expect.stringContaining('Dear Rahul,') as string,
      });
    });
    expect(within(dialog).getByText(/Showing the email one person/)).toBeInTheDocument();
    expect(within(dialog).getByTestId('preview-subject')).toHaveTextContent(
      'Subject: Your invoice is due',
    );
  });
});

describe('importing HTML from the Templates page', () => {
  it('turns an HTML email into a template and opens it', async () => {
    const { TemplatesPage } = await import('../pages/TemplatesPage');
    const { Route, Routes } = await import('react-router');
    const api = mockApi({
      templates: {
        pickHtml: vi.fn(() =>
          ok({
            name: 'spring.html',
            html: '<title>Spring news</title><h1>Hello</h1><p>News <img src="https://x.example/a.png"></p>',
            kind: 'html' as const,
            assetIds: [],
          }),
        ),
      },
    });
    renderWithProviders(
      <Routes>
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/templates/:id" element={<p>Editing</p>} />
      </Routes>,
      { route: '/templates' },
    );

    await userEvent.click(await screen.findByRole('button', { name: 'More template options' }));
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Import an HTML email or Word document…' }),
    );

    await waitFor(() => {
      expect(api.templates.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Spring news',
          subject: 'Spring news',
          editorMode: 'write',
        }),
      );
    });
    expect(await screen.findByText('Editing')).toBeInTheDocument();
    expect(
      await screen.findByText(/1 picture from the file wasn't brought in/),
    ).toBeInTheDocument();
  });
});
