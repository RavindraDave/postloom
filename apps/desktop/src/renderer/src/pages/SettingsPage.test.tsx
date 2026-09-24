import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, renderWithProviders } from '../test/render';
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
});
