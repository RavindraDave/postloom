import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockApi, ok, renderWithProviders, sampleSender, sampleTemplate } from '../test/render';
import { TemplateEditor } from './TemplateEditor';

function renderEditor(template = sampleTemplate) {
  return renderWithProviders(<TemplateEditor template={template} />);
}

describe('TemplateEditor (Write mode)', () => {
  it('shows the letter with personal details as chips, and a happy checklist', async () => {
    mockApi();
    renderEditor();

    expect(screen.getByRole('textbox', { name: 'Template name' })).toHaveValue('Payment reminder');
    expect(screen.getByRole('textbox', { name: 'Subject' })).toHaveTextContent(
      'Your invoice is due',
    );
    const letter = screen.getByRole('textbox', { name: 'Email text' });
    expect(within(letter).getByText('First Name')).toHaveClass('pl-field');
    expect(await screen.findByText('Everything looks good')).toBeInTheDocument();
    expect(screen.getByTestId('save-status')).toHaveTextContent('Saved');
  });

  it('saves changes automatically', async () => {
    const api = mockApi();
    renderEditor();

    const subject = screen.getByLabelText(/^Subject/);
    await userEvent.clear(subject);
    await userEvent.type(subject, 'Invoice due');
    expect(screen.getByTestId('save-status')).toHaveTextContent('Unsaved changes');

    await waitFor(
      () => {
        expect(api.templates.save).toHaveBeenCalledWith(
          expect.objectContaining({ id: 't1', subject: 'Invoice due' }),
        );
      },
      { timeout: 3000 },
    );
    await waitFor(() => {
      expect(screen.getByTestId('save-status')).toHaveTextContent('Saved');
    });
  });

  it('tells people what to fix before sending', async () => {
    mockApi();
    renderEditor();

    await userEvent.clear(screen.getByLabelText(/^Subject/));
    const checklist = screen.getByRole('region', { name: 'Checklist' });
    expect(await within(checklist).findByText(/Add a subject so people know/)).toBeInTheDocument();
    expect(within(checklist).getByText('Must fix')).toBeInTheDocument();
  });

  it('inserts a new personal detail as a chip and saves it', async () => {
    const api = mockApi();
    renderEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Insert detail' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'New detail…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a detail' });
    await userEvent.type(within(dialog).getByLabelText(/Column name/), 'Amount');
    await userEvent.type(within(dialog).getByLabelText(/If it's empty/), 'your balance');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add detail' }));

    const letter = screen.getByRole('textbox', { name: 'Email text' });
    expect(await within(letter).findByText('Amount')).toHaveClass('pl-field');
    await waitFor(
      () => {
        expect(api.templates.save).toHaveBeenCalledWith(
          expect.objectContaining({
            document: expect.objectContaining({
              content: expect.arrayContaining([
                expect.objectContaining({
                  content: expect.arrayContaining([
                    { type: 'field', attrs: { name: 'Amount', fallback: 'your balance' } },
                  ]) as unknown,
                }),
              ]) as unknown,
            }) as unknown,
          }),
        );
      },
      { timeout: 3000 },
    );
  });

  it('refuses detail names that could break personalisation', async () => {
    mockApi();
    renderEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Insert detail' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'New detail…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a detail' });
    await userEvent.type(within(dialog).getByLabelText(/Column name/), 'Name"}}');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add detail' }));
    expect(within(dialog).getByText(/no quotes, braces/)).toBeInTheDocument();
  });

  it('adds a button and flags its link until it is a real address', async () => {
    const api = mockApi();
    renderEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Button' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a button' });
    await userEvent.type(within(dialog).getByLabelText('Button text'), 'Pay now');
    await userEvent.type(within(dialog).getByLabelText(/Where it goes/), 'not a link');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add button' }));
    expect(within(dialog).getByText(/Use a full address/)).toBeInTheDocument();

    const href = within(dialog).getByLabelText(/Where it goes/);
    await userEvent.clear(href);
    await userEvent.type(href, 'https://example.com/pay');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add button' }));

    expect(await screen.findByText(/still points to the example address/)).toBeInTheDocument();
    await waitFor(
      () => {
        expect(api.templates.save).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );
  });

  it('sends a test from the chosen sender after saving', async () => {
    const api = mockApi();
    renderEditor();

    const sendTest = screen.getByRole('button', { name: 'Send me a test' });
    expect(sendTest).toBeDisabled();
    expect(screen.getByText("Choose who it's from first.")).toBeInTheDocument();

    await userEvent.click(await screen.findByRole('combobox', { name: 'From' }));
    await userEvent.click(
      await screen.findByRole('option', {
        name: `${sampleSender.fromName} <${sampleSender.fromAddress}>`,
      }),
    );
    await waitFor(() => {
      expect(api.templates.save).toHaveBeenCalledWith({ id: 't1', defaultSenderProfileId: 's1' });
    });

    await userEvent.click(screen.getByRole('button', { name: 'Send me a test' }));
    await waitFor(() => {
      expect(api.templates.sendTest).toHaveBeenCalledWith({ id: 't1', senderId: 's1' });
    });
    expect(await screen.findByText(/Test sent to asha@example.com/)).toBeInTheDocument();
  });

  it('adds a picture that travels inside the email, and asks for a description', async () => {
    const api = mockApi();
    renderEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Picture' }));
    expect(api.assets.pickImage).toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog', { name: 'Add a picture' });
    expect(within(dialog).getByText(/travels inside each email/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add picture' }));
    expect(within(dialog).getByText('Describe the picture in a few words.')).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText(/Describe the picture/), 'Our shop');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add picture' }));

    const letter = screen.getByRole('textbox', { name: 'Email text' });
    const picture = await within(letter).findByRole('img', { name: 'Our shop' });
    expect(picture).toHaveAttribute('src', 'app://postloom/assets/img1');
    await waitFor(
      () => {
        expect(api.templates.save).toHaveBeenCalledWith(
          expect.objectContaining({
            document: expect.objectContaining({
              content: expect.arrayContaining([
                {
                  type: 'image',
                  attrs: { assetId: 'img1', alt: 'Our shop', width: 600, align: 'center' },
                },
              ]) as unknown,
            }) as unknown,
          }),
        );
      },
      { timeout: 3000 },
    );
  });

  it('does nothing when no picture is chosen', async () => {
    mockApi({ assets: { pickImage: vi.fn(() => ok(null)) } });
    renderEditor();
    await userEvent.click(screen.getByRole('button', { name: 'Picture' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('puts a personal detail in the subject as a chip', async () => {
    const api = mockApi();
    renderEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Insert detail in the subject' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'First Name' }));

    const subject = screen.getByRole('textbox', { name: 'Subject' });
    expect(within(subject).getByText('First Name')).toHaveClass('pl-field');
    await waitFor(
      () => {
        expect(api.templates.save).toHaveBeenCalledWith(
          expect.objectContaining({ subject: expect.stringContaining('{{First Name}}') as string }),
        );
      },
      { timeout: 3000 },
    );
  });

  it('previews in the chosen sender’s brand look', async () => {
    const api = mockApi({
      senders: {
        list: vi.fn(() =>
          ok([
            {
              ...sampleSender,
              brand: {
                primaryColor: '#7A3E9D',
                fontFamily: 'Georgia, Times, serif',
                logo: { assetId: 'logo9', width: 300, height: 90 },
              },
            },
          ]),
        ),
      },
    });
    renderEditor({ ...sampleTemplate, defaultSenderProfileId: 's1' });

    const letter = screen.getByRole('textbox', { name: 'Email text' });
    expect(await screen.findByRole('img', { name: sampleSender.fromName })).toHaveAttribute(
      'src',
      'app://postloom/assets/logo9',
    );
    expect(letter).toBeInTheDocument();
    await waitFor(() => {
      expect(api.templates.renderPreview).toHaveBeenCalledWith({
        mjml: expect.stringContaining('app://postloom/assets/logo9') as string,
      });
    });
  });

  it('restores an earlier version', async () => {
    const restored = { ...sampleTemplate, subject: 'Old subject' };
    const api = mockApi({
      templates: {
        versions: vi.fn(() =>
          ok([
            { versionNo: 2, subject: 'Old subject', note: null, createdAt: '2026-09-20T10:00:00Z' },
          ]),
        ),
        restoreVersion: vi.fn(() => ok(restored)),
      },
    });
    renderEditor();

    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Version history' }));
    const drawer = await screen.findByRole('dialog', { name: 'Version history' });
    expect(await within(drawer).findByText('Version 2')).toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole('button', { name: 'Restore' }));

    await waitFor(() => {
      expect(api.templates.restoreVersion).toHaveBeenCalledWith({ id: 't1', versionNo: 2 });
    });
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Subject' })).toHaveTextContent('Old subject');
    });
  });
});
