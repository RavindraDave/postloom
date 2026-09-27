import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockApi, ok, renderWithProviders, sampleAccount, sampleSender } from '../test/render';
import { SendersPage } from './SendersPage';

describe('SendersPage', () => {
  it('points to setup when no email account is connected', async () => {
    mockApi({ accounts: { list: vi.fn(() => ok([])) }, senders: { list: vi.fn(() => ok([])) } });
    renderWithProviders(<SendersPage />);

    expect(await screen.findByText('Connect your email first')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New sender' })).toBeDisabled();
  });

  it('shows where each sending setting comes from', async () => {
    mockApi({
      senders: {
        list: vi.fn(() =>
          ok([
            {
              ...sampleSender,
              effective: {
                delayMs: { value: 5000, source: 'account' as const },
                dailyLimit: { value: 500, source: 'provider' as const },
              },
            },
          ]),
        ),
      },
    });
    renderWithProviders(<SendersPage />);

    expect(await screen.findByText('Same as the Office Gmail account')).toBeInTheDocument();
    expect(screen.getByText('5 seconds')).toBeInTheDocument();
    expect(screen.getByText('Gmail allows about 500 a day')).toBeInTheDocument();
  });

  it('lets a sender set its own pace, and go back to the inherited one', async () => {
    const api = mockApi();
    renderWithProviders(<SendersPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Change for this sender' }));
    const seconds = screen.getByLabelText('Seconds between emails');
    await userEvent.clear(seconds);
    await userEvent.type(seconds, '8');
    await userEvent.click(screen.getAllByRole('button', { name: 'Save changes' }).at(-1)!);

    await waitFor(() => {
      expect(api.senders.update).toHaveBeenCalledWith({ id: 's1', delayMs: 8000 });
    });
  });

  it('adds a sender through the chosen account', async () => {
    const api = mockApi();
    renderWithProviders(<SendersPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'New sender' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a sender' });
    await userEvent.type(within(dialog).getByLabelText(/Name people see/), 'Club News');
    await userEvent.type(within(dialog).getByLabelText(/Replies go to/), 'not-an-email');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add sender' }));
    expect(within(dialog).getByText(/doesn't look like an email address/)).toBeInTheDocument();

    await userEvent.clear(within(dialog).getByLabelText(/Replies go to/));
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Signature' }),
      'Asha Kapoor{Enter}Club secretary',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add sender' }));
    await waitFor(() => {
      expect(api.senders.create).toHaveBeenCalledWith({
        name: 'Club News',
        emailAccountId: 'a1',
        fromName: 'Club News',
        fromAddress: 'asha@example.com',
        replyTo: null,
        signature: 'Asha Kapoor\nClub secretary',
      });
    });
  });

  it('shows account status and explains why an account in use cannot be removed', async () => {
    const api = mockApi();
    renderWithProviders(<SendersPage />);

    await userEvent.click(await screen.findByRole('tab', { name: /Email accounts/ }));
    const card = await screen.findByRole('region', { name: 'Office Gmail' });
    expect(within(card).getByText('Working')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Remove' })).toBeDisabled();
    expect(
      within(card).getByText(/Used by 1 sender\. Move or remove it first/),
    ).toBeInTheDocument();

    await userEvent.click(within(card).getByRole('button', { name: 'Send me a test email' }));
    expect(api.accounts.sendTestEmail).toHaveBeenCalledWith({ id: 'a1' });
    expect(await screen.findByText(/Test email sent to asha@example.com/)).toBeInTheDocument();
  });

  it('guides fixing an account whose password stopped working', async () => {
    const broken = { ...sampleAccount, lastTestOk: false };
    const api = mockApi({ accounts: { list: vi.fn(() => ok([broken])) } });
    renderWithProviders(<SendersPage />);

    const tab = await screen.findByRole('tab', { name: /Email accounts/ });
    expect(tab).toHaveTextContent('1 needs you');
    await userEvent.click(tab);

    const card = await screen.findByRole('region', { name: 'Office Gmail' });
    expect(within(card).getByText('Needs you')).toBeInTheDocument();
    expect(
      within(card).getByText('Office Gmail stopped accepting the saved password'),
    ).toBeInTheDocument();

    await userEvent.type(within(card).getByLabelText(/New app password/), 'new pass');
    await userEvent.click(within(card).getByRole('button', { name: 'Check and save' }));

    await waitFor(() => {
      expect(api.accounts.update).toHaveBeenCalledWith({ id: 'a1', password: 'new pass' });
    });
    expect(await screen.findByText('Office Gmail is working again')).toBeInTheDocument();
  });
});
