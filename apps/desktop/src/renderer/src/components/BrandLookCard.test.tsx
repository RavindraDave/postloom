import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, renderWithProviders, sampleSender } from '../test/render';
import { BrandLookCard } from './BrandLookCard';

describe('BrandLookCard', () => {
  it('adds a brand look with a logo, colour and font', async () => {
    const api = mockApi();
    renderWithProviders(<BrandLookCard sender={sampleSender} />);

    const card = screen.getByRole('region', { name: 'Brand look' });
    expect(within(card).getByText("Emails use Postloom's plain look.")).toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: 'Add a brand look' }));

    await userEvent.click(within(card).getByRole('button', { name: 'Choose logo' }));
    expect(await within(card).findByRole('img', { name: 'Logo' })).toHaveAttribute(
      'src',
      'app://postloom/assets/img1',
    );
    const colour = within(card).getByLabelText('Button and accent colour');
    await userEvent.clear(colour);
    await userEvent.type(colour, '#7a3e9d');
    await userEvent.click(within(card).getByRole('button', { name: 'Save brand look' }));

    await waitFor(() => {
      expect(api.senders.setBrand).toHaveBeenCalledWith({
        id: 's1',
        brand: {
          primaryColor: '#7A3E9D',
          fontFamily: 'Arial, Helvetica, sans-serif',
          logoAssetId: 'img1',
        },
      });
    });
  });

  it('goes back to the plain look', async () => {
    const api = mockApi();
    renderWithProviders(
      <BrandLookCard
        sender={{
          ...sampleSender,
          brand: { primaryColor: '#0E6B66', fontFamily: 'Georgia, Times, serif', logo: null },
        }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Use the plain look' }));
    await waitFor(() => {
      expect(api.senders.setBrand).toHaveBeenCalledWith({ id: 's1', brand: null });
    });
  });
});
