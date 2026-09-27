import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { mockApi, ok, renderWithProviders, sampleAccount, sampleSend } from '../test/render';
import { HomePage } from './HomePage';

describe('HomePage checklist', () => {
  it('starts with connecting an email account', async () => {
    mockApi({
      accounts: { list: vi.fn(() => ok([])) },
      templates: { list: vi.fn(() => ok([])) },
    });
    renderWithProviders(<HomePage />);

    expect(await screen.findByText('0 of 3 done')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect your email' })).toBeInTheDocument();
  });

  it('ticks off what is done', async () => {
    mockApi();
    renderWithProviders(<HomePage />);

    expect(await screen.findByText('2 of 3 done')).toBeInTheDocument();
    expect(screen.getByText('Office Gmail is ready.')).toBeInTheDocument();
    expect(screen.getByText('You have 1 template.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send emails' })).toBeInTheDocument();
  });

  it('ticks off sending once there is a send in History', async () => {
    mockApi({ sends: { list: vi.fn(() => ok([sampleSend])) } });
    renderWithProviders(<HomePage />);

    expect(await screen.findByText('3 of 3 done')).toBeInTheDocument();
    expect(
      screen.getByText("You've sent emails. You'll find them in History."),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send emails' })).not.toBeInTheDocument();
  });

  it('sends people to fix an account that needs them', async () => {
    mockApi({ accounts: { list: vi.fn(() => ok([{ ...sampleAccount, lastTestOk: false }])) } });
    renderWithProviders(<HomePage />);

    expect(await screen.findByRole('button', { name: 'Fix it' })).toBeInTheDocument();
    expect(screen.getByText(/Office Gmail needs you/)).toBeInTheDocument();
  });
});
