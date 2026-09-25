import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockApi, ok, renderWithProviders, sampleAccount } from '../test/render';
import { SetupPage } from './SetupPage';

describe('SetupPage', () => {
  it('walks through connecting Gmail, naming the sender and sending a test', async () => {
    const api = mockApi({
      accounts: { create: vi.fn(() => ok({ ...sampleAccount, name: 'My Gmail' })) },
    });
    renderWithProviders(<SetupPage />, { route: '/setup' });

    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Welcome');
    await userEvent.click(screen.getByRole('button', { name: "Let's start" }));

    // Step 2: provider, with a plain-language heads-up about app passwords.
    const next = screen.getByRole('button', { name: 'Continue' });
    expect(next).toBeDisabled();
    expect(screen.getByText('Choose your email provider to continue.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /Gmail/ }));
    expect(screen.getByText(/app password” from Gmail/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Gmail' }));

    // Connect: validated before anything is sent to the provider.
    await userEvent.click(screen.getByRole('button', { name: 'Check and save' }));
    expect(await screen.findByText(/doesn't look like an email address/)).toBeInTheDocument();
    expect(api.accounts.create).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/Your email address/), 'asha@example.com');
    await userEvent.type(screen.getByLabelText(/App password/), 'abcd efgh ijkl mnop');
    await userEvent.click(screen.getByRole('button', { name: 'Check and save' }));

    await waitFor(() => {
      expect(api.accounts.create).toHaveBeenCalledWith({
        host: 'smtp.gmail.com',
        port: 587,
        security: 'starttls',
        username: 'asha@example.com',
        password: 'abcd efgh ijkl mnop',
        provider: 'gmail',
        name: 'My Gmail',
      });
    });

    // Who you are.
    await userEvent.type(await screen.findByLabelText(/Name people see/), 'Asha Kapoor');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(api.senders.create).toHaveBeenCalledWith({
        name: 'Asha Kapoor',
        emailAccountId: 'a1',
        fromName: 'Asha Kapoor',
        fromAddress: 'asha@example.com',
      });
    });

    // Test email.
    await userEvent.click(await screen.findByRole('button', { name: 'Send the test email' }));
    expect(await screen.findByText('Sent! Check your inbox')).toBeInTheDocument();
    expect(api.accounts.sendTestEmail).toHaveBeenCalledWith({ id: 'a1' });
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('heading', { name: "You're all set" })).toBeInTheDocument();
  });

  it('explains a rejected password and does not save the account', async () => {
    const api = mockApi({
      accounts: {
        create: vi.fn(() =>
          Promise.resolve({
            ok: false as const,
            error: { code: 'EMAIL_AUTH_FAILED' as const, messageKey: 'errors.emailAuthFailed' },
          }),
        ),
      },
    });
    renderWithProviders(<SetupPage />, { route: '/setup' });

    await userEvent.click(screen.getByRole('button', { name: "Let's start" }));
    await userEvent.click(screen.getByRole('radio', { name: /Outlook/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Outlook' }));
    await userEvent.type(screen.getByLabelText(/Your email address/), 'asha@outlook.com');
    await userEvent.type(screen.getByLabelText(/App password/), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Check and save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/didn't accept the password/);
    // Still on the connect step: nothing moved on.
    expect(screen.getByRole('button', { name: 'Check and save' })).toBeInTheDocument();
    expect(api.senders.create).not.toHaveBeenCalled();
  });

  it('asks for server details for other providers and warns about a weak keyring', async () => {
    mockApi({ app: { getSecurity: vi.fn(() => ok({ secretProtection: 'weak' as const })) } });
    renderWithProviders(<SetupPage />, { route: '/setup' });

    await userEvent.click(screen.getByRole('button', { name: "Let's start" }));
    await userEvent.click(screen.getByRole('radio', { name: /Something else/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Something else' }));

    expect(await screen.findByText(/no password keyring/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Outgoing mail server/)).toBeVisible();
    await userEvent.type(screen.getByLabelText(/Your email address/), 'me@company.example');
    await userEvent.type(screen.getByLabelText(/^Password/), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'Check and save' }));
    expect(await screen.findByText('Enter the server name.')).toBeInTheDocument();
  });

  it('blocks saving when passwords cannot be stored safely', async () => {
    mockApi({
      app: { getSecurity: vi.fn(() => ok({ secretProtection: 'unavailable' as const })) },
    });
    renderWithProviders(<SetupPage />, { route: '/setup' });

    await userEvent.click(screen.getByRole('button', { name: "Let's start" }));
    await userEvent.click(screen.getByRole('radio', { name: /iCloud/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue with iCloud Mail' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/can't store passwords safely/);
    expect(screen.getByRole('button', { name: 'Check and save' })).toBeDisabled();
  });
});
