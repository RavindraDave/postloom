import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { SendSummary } from '@postloom/contracts';
import { mockApi, ok, renderWithProviders, sampleSend } from '../../test/render';
import { SendProgressPage } from './SendProgressPage';

function renderProgress(send: SendSummary, overrides: Parameters<typeof mockApi>[0] = {}) {
  const api = mockApi({
    ...overrides,
    sends: { get: vi.fn(() => ok(send)), ...overrides.sends },
  });
  renderWithProviders(
    <Routes>
      <Route path="/send/:id" element={<SendProgressPage />} />
    </Routes>,
    { route: `/send/${send.id}` },
  );
  return api;
}

const paused = (reason: SendSummary['pauseReason'], extra: Partial<SendSummary> = {}) => ({
  ...sampleSend,
  status: 'paused' as const,
  running: false,
  pauseReason: reason,
  current: null,
  etaMs: 0,
  ...extra,
});

describe('SendProgressPage', () => {
  it('shows live progress with who is being emailed now', async () => {
    const api = renderProgress(sampleSend);
    expect(await screen.findByText('Sending… 7 of 10')).toBeInTheDocument();
    expect(screen.getByText('Now: row 9, ben@example.com')).toBeInTheDocument();
    expect(screen.getByText('About 3 minutes left')).toBeInTheDocument();
    expect(screen.getByTestId('count-sent')).toHaveTextContent('7');
    expect(screen.getByTestId('count-left')).toHaveTextContent('3');

    await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await waitFor(() => {
      expect(api.sends.pause).toHaveBeenCalledWith({ id: 'send1' });
    });
  });

  it('asks before stopping', async () => {
    const api = renderProgress(sampleSend);
    await userEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    const dialog = await screen.findByRole('dialog', { name: 'Stop sending?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Stop sending' }));
    await waitFor(() => {
      expect(api.sends.stop).toHaveBeenCalledWith({ id: 'send1' });
    });
  });

  it.each([
    ['dailyLimit', 'reached its daily limit'],
    ['auth', 'stopped accepting the password'],
    ['connection', "couldn't reach your email provider"],
    ['user', 'Nothing more is sent until you carry on'],
  ] as const)('explains a pause for %s, with a way to carry on', async (reason, text) => {
    const api = renderProgress(paused(reason));
    expect(await screen.findByText(new RegExp(text))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Carry on sending' }));
    await waitFor(() => {
      expect(api.sends.resume).toHaveBeenCalledWith({ id: 'send1' });
    });
  });

  it('after a crash, asks about emails that may have gone out', async () => {
    const api = renderProgress(
      paused('interrupted', {
        counts: { pending: 5, sending: 0, sent: 4, failed: 0, skipped: 0, uncertain: 1 },
      }),
      {
        sends: {
          problems: vi.fn(() =>
            ok([
              {
                rowNo: 6,
                to: 'dan@example.com',
                status: 'uncertain' as const,
                errorCode: 'interrupted',
              },
            ]),
          ),
        },
      },
    );
    expect(await screen.findByText('1 email may or may not have been sent')).toBeInTheDocument();
    expect(await screen.findByText('dan@example.com')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Skip them' }));
    await waitFor(() => {
      expect(api.sends.resolveUncertain).toHaveBeenCalledWith({ id: 'send1', action: 'skip' });
    });
  });

  it('shows the result, why some couldn’t be sent, and retries them', async () => {
    const api = renderProgress(
      {
        ...sampleSend,
        status: 'finished',
        running: false,
        current: null,
        etaMs: 0,
        counts: { pending: 0, sending: 0, sent: 8, failed: 1, skipped: 1, uncertain: 0 },
      },
      {
        sends: {
          problems: vi.fn(() =>
            ok([
              {
                rowNo: 3,
                to: 'x@nowhere.example',
                status: 'failed' as const,
                errorCode: 'rejected:550',
              },
              {
                rowNo: 5,
                to: 'ben@example.com',
                status: 'skipped' as const,
                errorCode: 'doNotEmail',
              },
            ]),
          ),
        },
      },
    );
    expect(await screen.findByText('Done! 8 emails sent.')).toBeInTheDocument();
    expect(screen.getByText("1 couldn't be sent. See why below.")).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'People not emailed' });
    expect(within(table).getByText(/the address may not exist/)).toBeInTheDocument();
    expect(within(table).getByText(/Do not email/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Try the failed ones again (1)' }));
    await waitFor(() => {
      expect(api.sends.retryFailed).toHaveBeenCalledWith({ id: 'send1' });
    });
  });

  it('says how many are left after a stop', async () => {
    renderProgress({ ...paused(null), status: 'stopped' });
    expect(
      await screen.findByText("Stopped. 3 people haven't been emailed yet."),
    ).toBeInTheDocument();
  });
});
