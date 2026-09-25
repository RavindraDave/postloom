import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { mockApi, renderWithProviders } from '../test/render';
import { ErrorBoundary } from './ErrorBoundary';

function Boom({ explode }: { explode: boolean }) {
  if (explode) throw new Error('secret stack details');
  return <p>All fine</p>;
}

function Harness() {
  const [explode, setExplode] = useState(true);
  return (
    <ErrorBoundary
      onReset={() => {
        setExplode(false);
      }}
    >
      <Boom explode={explode} />
    </ErrorBoundary>
  );
}

describe('ErrorBoundary', () => {
  it('shows a calm message without technical details, and recovers', async () => {
    mockApi();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderWithProviders(<Harness />);

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong on this screen');
    expect(document.body.textContent).not.toContain('secret stack details');

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('All fine')).toBeInTheDocument();
    log.mockRestore();
  });
});
