import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { mockApi, renderWithProviders } from '../test/render';
import { HelpPage } from './HelpPage';

function renderHelp(route = '/help') {
  renderWithProviders(
    <Routes>
      <Route path="/help" element={<HelpPage />} />
      <Route path="/help/:topic" element={<HelpPage />} />
      <Route path="/setup" element={<p>Setup wizard</p>} />
    </Routes>,
    { route },
  );
}

describe('HelpPage', () => {
  it('lists the guides and finds them by any word in them', async () => {
    mockApi();
    renderHelp();
    const guides = screen.getByRole('navigation', { name: 'Help' });
    expect(within(guides).getAllByRole('link').length).toBeGreaterThanOrEqual(10);

    await userEvent.type(screen.getByLabelText('Search help'), 'app password');
    expect(within(guides).getByRole('link', { name: /Connecting Gmail/ })).toBeInTheDocument();
    expect(within(guides).queryByRole('link', { name: /Backups and your data/ })).toBeNull();

    await userEvent.clear(screen.getByLabelText('Search help'));
    await userEvent.type(screen.getByLabelText('Search help'), 'zzzz');
    expect(screen.getByText('Nothing matches “zzzz”. Try another word.')).toBeInTheDocument();
    expect(await screen.findByText('Postloom 0.1.0')).toBeInTheDocument();
  });

  it('opens a guide with numbered steps, and goes back', async () => {
    mockApi();
    renderHelp('/help/connect-gmail');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Connecting Gmail or Google Workspace' }),
    ).toBeInTheDocument();
    const steps = screen.getAllByRole('list')[0]!;
    expect(within(steps).getAllByRole('listitem')[0]).toHaveTextContent(
      'Open your Google Account and choose Security.',
    );
    await userEvent.click(screen.getByRole('link', { name: 'All help' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Help' })).toBeInTheDocument();
  });

  it('exports diagnostics and can start the setup again', async () => {
    const api = mockApi();
    renderHelp();
    await userEvent.click(screen.getByRole('button', { name: 'Export diagnostics' }));
    expect(
      await screen.findByText('Saved as Postloom diagnostics 2026-09-25.json.'),
    ).toBeInTheDocument();
    expect(api.app.exportDiagnostics).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Run the setup again' }));
    expect(await screen.findByText('Setup wizard')).toBeInTheDocument();
  });
});
