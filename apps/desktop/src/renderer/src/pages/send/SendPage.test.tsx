import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { mockApi, ok, renderWithProviders, SAMPLE_LIST } from '../../test/render';
import { SendPage } from './SendPage';

function renderSend(route = '/send') {
  return renderWithProviders(
    <Routes>
      <Route path="/send" element={<SendPage />} />
    </Routes>,
    { route },
  );
}

async function pickList() {
  await userEvent.click(await screen.findByRole('button', { name: 'Choose a file…' }));
  await screen.findByText('customers.xlsx');
}

describe('SendPage', () => {
  it('starts by asking for the list of people', async () => {
    mockApi();
    renderSend();
    expect(await screen.findByText('Choose your list of people')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(screen.getByRole('list', { name: 'Send steps' })).toBeInTheDocument();
  });

  it('shows the first rows and the guessed address column', async () => {
    const api = mockApi();
    renderSend();
    await pickList();

    expect(api.recipients.inspect).toHaveBeenCalledWith({
      token: SAMPLE_LIST.token,
      sheet: 'Sheet1',
    });
    expect(screen.getByText('3 people on this list')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'The first rows of your list' });
    expect(within(table).getByText('ben@example.com')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Send to/ })).toHaveValue('Email');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('says what went wrong when a file can’t be read', async () => {
    mockApi({
      recipients: {
        pick: vi.fn(() =>
          Promise.resolve({
            ok: false as const,
            error: { code: 'VALIDATION_FAILED' as const, messageKey: 'errors.spreadsheetType' },
          }),
        ),
      },
    });
    renderSend();
    await userEvent.click(await screen.findByRole('button', { name: 'Choose a file…' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Excel (.xlsx) and CSV');
  });

  it('checks everyone, previews each person and sends a test with their details', async () => {
    const api = mockApi();
    renderSend('/send?template=t1');
    await pickList();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Template and sender: the template from the link, the only sender, details matched.
    expect(await screen.findByRole('combobox', { name: 'First Name' })).toHaveValue('First Name');
    expect(screen.getByRole('combobox', { name: /Send as/ })).toHaveValue(
      'Asha (Accounts) <asha@example.com>',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('3 emails will be sent from Asha Kapoor.')).toBeInTheDocument();
    expect(api.recipients.check).toHaveBeenCalledWith(
      expect.objectContaining({ templateId: 't1', senderId: 's1', skipRows: [] }),
    );
    expect(await screen.findByText('Person 1 of 3')).toBeInTheDocument();
    expect(await screen.findByText('asha@example.com')).toBeInTheDocument();
    await waitFor(() => {
      expect(api.templates.renderPreview).toHaveBeenCalledWith({
        mjml: expect.stringContaining('Asha') as string,
      });
    });

    await userEvent.click(screen.getByRole('button', { name: 'Next person' }));
    expect(await screen.findByText('Person 2 of 3')).toBeInTheDocument();
    expect(await screen.findByText('ben@example.com')).toBeInTheDocument();

    // A test first; until then Continue waits.
    const next = screen.getAllByRole('button', { name: 'Continue' })[0]!;
    expect(next).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: "Send this person's email to me" }));
    await waitFor(() => {
      expect(api.templates.sendTest).toHaveBeenCalledWith({
        id: 't1',
        senderId: 's1',
        values: { 'First Name': 'Ben', 'Invoice No': 'INV-2' },
      });
    });
    expect(await screen.findByText(/with the details from row 3/)).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('button', { name: 'Continue' })[0]!);
    expect(
      await screen.findByText('Send 3 emails from Office Gmail as Asha (Accounts)?'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send now' })).toBeDisabled();
  });

  it('leaves out rows with problems when asked, and can put them back', async () => {
    const check = vi.fn((input: { skipRows: number[] }) =>
      ok({
        problems:
          input.skipRows.length > 0
            ? []
            : [{ id: 'invalidAddress' as const, severity: 'mustFix' as const, rows: [4] }],
        toSendRows: input.skipRows.length > 0 ? [2, 3] : [2, 3, 4],
        leftOut: { skipped: input.skipRows.length, disabled: 0, doNotEmail: 0, duplicate: 0 },
        dailyLimit: 450,
        remainingToday: 450,
      }),
    );
    mockApi({ recipients: { check } });
    renderSend('/send?template=t1');
    await pickList();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('combobox', { name: 'First Name' });
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    const problem = await screen.findByText("1 row has an email address that isn't valid.");
    expect(screen.getByRole('region', { name: 'Must fix before sending' })).toContainElement(
      problem,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Leave these rows out' }));
    expect(await screen.findByText('Left out: 1 you chose.')).toBeInTheDocument();
    expect(check).toHaveBeenLastCalledWith(expect.objectContaining({ skipRows: [4] }));

    await userEvent.click(screen.getByRole('button', { name: 'Put back the rows I left out' }));
    await waitFor(() => {
      expect(check).toHaveBeenLastCalledWith(expect.objectContaining({ skipRows: [] }));
    });
  });
});
