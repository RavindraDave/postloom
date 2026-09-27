import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockApi, ok, renderWithProviders } from '../test/render';
import { UpdateNotice } from './UpdateNotice';

describe('UpdateNotice', () => {
  it('says when a newer version is out, and opens its download page', async () => {
    const api = mockApi({
      app: {
        updateStatus: vi.fn(() =>
          ok({ state: 'available' as const, latestVersion: '0.2.0', checkedAt: null }),
        ),
      },
    });
    renderWithProviders(<UpdateNotice />);
    expect(await screen.findByText('Postloom 0.2.0 is out')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Download Postloom 0.2.0 (opens your browser)' }),
    );
    await waitFor(() => {
      expect(api.app.openDownloadPage).toHaveBeenCalled();
    });
  });

  it('stays out of the way when up to date', async () => {
    const api = mockApi();
    renderWithProviders(<UpdateNotice />);
    await waitFor(() => {
      expect(api.app.updateStatus).toHaveBeenCalledWith({ check: false });
    });
    expect(screen.queryByText(/is out/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Download Postloom/ })).not.toBeInTheDocument();
  });
});
