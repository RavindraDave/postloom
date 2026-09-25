import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { mockApi, ok, renderWithProviders, sampleSend } from '../test/render';
import { HistoryPage } from './HistoryPage';

function renderHistory() {
  renderWithProviders(
    <Routes>
      <Route path="/history" element={<HistoryPage />} />
      <Route path="/send/:id" element={<p>Send result</p>} />
      <Route path="/send" element={<p>Send wizard</p>} />
    </Routes>,
    { route: '/history' },
  );
}

describe('HistoryPage', () => {
  it('explains what appears here before anything is sent', async () => {
    mockApi();
    renderHistory();
    expect(await screen.findByText('Nothing sent yet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Send emails' }));
    expect(await screen.findByText('Send wizard')).toBeInTheDocument();
  });

  it('lists sends with their counts and status, and opens one', async () => {
    mockApi({
      sends: {
        list: vi.fn(() =>
          ok([
            {
              ...sampleSend,
              status: 'finished' as const,
              running: false,
              counts: { pending: 0, sending: 0, sent: 245, failed: 2, skipped: 3, uncertain: 1 },
            },
          ]),
        ),
      },
    });
    renderHistory();
    const table = await screen.findByRole('table', { name: 'Sends' });
    const row = within(table).getAllByRole('row')[1]!;
    expect(within(row).getByText('Payment reminder')).toBeInTheDocument();
    expect(within(row).getByText('customers.xlsx')).toBeInTheDocument();
    expect(within(row).getByText('245')).toBeInTheDocument();
    expect(within(row).getByText('3')).toBeInTheDocument();
    expect(within(row).getByText('Finished')).toBeInTheDocument();

    await userEvent.click(within(row).getByRole('link', { name: /^Open Payment reminder from / }));
    expect(await screen.findByText('Send result')).toBeInTheDocument();
  });
});
