import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppRoutes } from './App';
import { mockApi, renderWithProviders } from './test/render';

beforeEach(() => {
  mockApi();
});

describe('app navigation', () => {
  it('shows every main section in the sidebar', () => {
    renderWithProviders(<AppRoutes />);

    const nav = screen.getByRole('navigation', { name: 'Main' });
    for (const label of [
      'Home',
      'Send emails',
      'Templates',
      'Senders & accounts',
      'History',
      'Settings',
      'Help',
    ]) {
      expect(nav).toHaveTextContent(label);
    }
  });

  it('marks the current page in the sidebar', () => {
    renderWithProviders(<AppRoutes />, { route: '/history' });

    expect(screen.getByRole('link', { name: 'History' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('shows the getting-started checklist and version on Home', async () => {
    renderWithProviders(<AppRoutes />);

    expect(screen.getByRole('heading', { name: 'Welcome to Postloom' })).toBeInTheDocument();
    expect(screen.getByText('Connect your email')).toBeInTheDocument();
    expect(await screen.findByText('Version 0.1.0')).toBeInTheDocument();
  });
});
