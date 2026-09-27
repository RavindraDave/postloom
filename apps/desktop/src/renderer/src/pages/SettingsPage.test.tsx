import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { mockApi, ok, renderWithProviders } from '../test/render';
import { SettingsPage } from './SettingsPage';

describe('SettingsPage', () => {
  it('shows the saved preferences', async () => {
    mockApi();
    renderWithProviders(<SettingsPage />);

    expect(await screen.findByRole('radio', { name: 'Same as my computer' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Normal' })).toBeChecked();
    expect(screen.getByRole('switch', { name: /Always ask me before sending/ })).toBeChecked();
  });

  it('saves changes straight away', async () => {
    const api = mockApi();
    renderWithProviders(<SettingsPage />);

    await userEvent.click(await screen.findByText('Dark'));
    await userEvent.click(screen.getByText('Largest'));
    await userEvent.click(screen.getByRole('switch', { name: /Always ask me before sending/ }));

    await waitFor(() => {
      expect(api.settings.update).toHaveBeenCalledWith({ colorScheme: 'dark' });
      expect(api.settings.update).toHaveBeenCalledWith({ textScale: 1.3 });
      expect(api.settings.update).toHaveBeenCalledWith({ confirmBeforeSend: false });
    });
  });

  it('backs up now and lists backups', async () => {
    const api = mockApi();
    renderWithProviders(<SettingsPage />);
    const table = await screen.findByRole('table', { name: 'Backups' });
    expect(within(table).getByText('Daily')).toBeInTheDocument();
    expect(within(table).getByText('1.2 MB')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back up now' }));
    expect(await screen.findByText('Backup saved.')).toBeInTheDocument();
    expect(api.data.backupNow).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Open the data folder' }));
    expect(api.data.openFolder).toHaveBeenCalled();
  });

  it('asks before restoring a backup, and warns about passwords', async () => {
    const api = mockApi();
    renderWithProviders(<SettingsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /^Restore / }));
    const dialog = await screen.findByRole('dialog', { name: 'Restore this backup?' });
    expect(within(dialog).getByText(/Saved email passwords are never kept/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Restore and restart' }));
    await waitFor(() => {
      expect(api.data.restore).toHaveBeenCalledWith({
        fileName: 'postloom-daily-2026-09-25.sqlite',
      });
    });
  });

  it('keeps History for the chosen time, and clears it after asking', async () => {
    const api = mockApi();
    renderWithProviders(<SettingsPage />);
    await userEvent.click(
      await screen.findByRole('combobox', { name: /Keep sends in History for/ }),
    );
    await userEvent.click(screen.getByRole('option', { name: '90 days' }));
    await waitFor(() => {
      expect(api.settings.update).toHaveBeenCalledWith({ historyDays: 90 });
    });

    await userEvent.click(screen.getByRole('button', { name: 'Clear history now' }));
    const dialog = await screen.findByRole('dialog', { name: 'Clear History?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Clear history' }));
    expect(await screen.findByText('3 sends removed from History.')).toBeInTheDocument();
  });

  it('saves the sending defaults when a box is left', async () => {
    const api = mockApi();
    renderWithProviders(<SettingsPage />);
    const delay = await screen.findByRole('textbox', { name: /Wait between emails/ });
    await userEvent.clear(delay);
    await userEvent.type(delay, '5');
    await userEvent.tab();
    const limit = screen.getByRole('textbox', { name: /Most emails a day/ });
    await userEvent.clear(limit);
    await userEvent.type(limit, '200');
    await userEvent.tab();
    await waitFor(() => {
      expect(api.settings.update).toHaveBeenCalledWith({ delayMs: 5000 });
      expect(api.settings.update).toHaveBeenCalledWith({ dailyLimit: 200 });
    });
  });

  it('shows the version', async () => {
    mockApi();
    renderWithProviders(<SettingsPage />);
    expect(await screen.findByText('Version 0.1.0')).toBeInTheDocument();
  });

  it('checks for a new version on request, and can be turned off', async () => {
    const api = mockApi();
    renderWithProviders(<SettingsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Check now' }));
    await waitFor(() => {
      expect(api.app.updateStatus).toHaveBeenCalledWith({ check: true });
    });
    expect(await screen.findByText('You have the latest version.')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('switch', { name: /Tell me when a new version is out/ }),
    );
    await waitFor(() => {
      expect(api.settings.update).toHaveBeenCalledWith({ checkForUpdates: false });
    });
  });

  it('leaves Store installs to the Store', async () => {
    mockApi({
      app: {
        updateStatus: vi.fn(() =>
          ok({ state: 'managedByStore' as const, latestVersion: null, checkedAt: null }),
        ),
      },
    });
    renderWithProviders(<SettingsPage />);
    expect(
      await screen.findByText('The Microsoft Store keeps Postloom up to date.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check now' })).not.toBeInTheDocument();
  });
});
