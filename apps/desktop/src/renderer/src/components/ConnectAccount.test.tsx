import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockApi, ok, renderWithProviders, sampleAccount } from '../test/render';
import { ConnectAccount } from './ConnectAccount';

const withSignIn = () =>
  mockApi({
    accounts: {
      signInProviders: vi.fn(() => ok(['google', 'microsoft'] as ('google' | 'microsoft')[])),
    },
  });

describe('ConnectAccount', () => {
  it('signs Gmail in with Google, with an app password still on offer', async () => {
    const api = withSignIn();
    const onConnected = vi.fn();
    renderWithProviders(<ConnectAccount provider="gmail" onConnected={onConnected} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Sign in with Google' }));
    await waitFor(() => {
      expect(onConnected).toHaveBeenCalled();
    });
    expect(api.accounts.signIn).toHaveBeenCalledWith({ provider: 'google' });

    await userEvent.click(screen.getByRole('button', { name: 'Use an app password instead' }));
    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '← Sign in with Google instead' }));
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
  });

  it('says so when signing in doesn’t finish', async () => {
    mockApi({
      accounts: {
        signInProviders: vi.fn(() => ok(['microsoft'] as ('google' | 'microsoft')[])),
        signIn: vi.fn(() =>
          Promise.resolve({
            ok: false as const,
            error: { code: 'EMAIL_AUTH_FAILED' as const, messageKey: 'errors.signInCancelled' },
          }),
        ),
      },
    });
    renderWithProviders(<ConnectAccount provider="outlook" onConnected={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in with Microsoft' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Signing in was cancelled');
  });

  it('asks for a password where the build or provider has no sign-in', async () => {
    mockApi();
    renderWithProviders(<ConnectAccount provider="gmail" onConnected={vi.fn()} />);
    expect(await screen.findByLabelText(/app password/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sign in with/ })).not.toBeInTheDocument();
    expect(sampleAccount.auth).toBe('password');
  });
});
