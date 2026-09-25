import { DEFAULT_PREFERENCES } from '@postloom/contracts';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, ok, renderWithProviders, sampleSender } from '../../test/render';
import { ConfirmStep, LAST_CHANCE_SECONDS } from './ConfirmStep';

const check = {
  token: 'list-1',
  sheet: 'Sheet1',
  templateId: 't1',
  senderId: 's1',
  mapping: { to: 'Email', cc: null, bcc: null, enabled: null, attachments: null },
  fieldMap: {},
  skipRows: [],
  sendDuplicatesOnce: false,
};

/** Moves the clock on a second at a time, as each second is its own timer. */
function tick(seconds: number) {
  for (let second = 0; second < seconds; second += 1) {
    act(() => {
      vi.advanceTimersByTime(1000);
    });
  }
}

function renderConfirm() {
  return renderWithProviders(<ConfirmStep check={check} senderId="s1" senders={[sampleSender]} />);
}

describe('ConfirmStep', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits 10 seconds after Send, and can be called off', async () => {
    const api = mockApi();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    renderConfirm();

    await user.click(await screen.findByRole('button', { name: 'Send now' }));
    expect(screen.getByRole('status')).toHaveTextContent(
      `Sending in ${String(LAST_CHANCE_SECONDS)} seconds…`,
    );
    tick(3);
    expect(screen.getByRole('status')).toHaveTextContent('Sending in 7 seconds…');
    await user.click(screen.getByRole('button', { name: "Don't send yet" }));
    tick(LAST_CHANCE_SECONDS);
    expect(api.sends.start).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Send now' }));
    tick(LAST_CHANCE_SECONDS);
    await waitFor(() => {
      expect(api.sends.start).toHaveBeenCalledWith(check);
    });
  });

  it('sends straight away when asking first is turned off', async () => {
    const api = mockApi({
      settings: { get: vi.fn(() => ok({ ...DEFAULT_PREFERENCES, confirmBeforeSend: false })) },
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    renderConfirm();

    await user.click(await screen.findByRole('button', { name: 'Send now' }));
    await waitFor(() => {
      expect(api.sends.start).toHaveBeenCalledWith(check);
    });
  });
});
