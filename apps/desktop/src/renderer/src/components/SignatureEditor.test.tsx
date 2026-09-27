import type { SenderSignature } from '@postloom/editor';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/render';
import { SignatureEditor } from './SignatureEditor';

const signature: SenderSignature = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Asha Kapoor' }] }],
};

describe('SignatureEditor', () => {
  it('shows the saved signature with its formatting tools', () => {
    renderWithProviders(<SignatureEditor value={signature} onChange={vi.fn()} />);
    expect(screen.getByRole('textbox', { name: 'Signature' })).toHaveTextContent('Asha Kapoor');
    const tools = screen.getByRole('toolbar', { name: 'Signature formatting' });
    expect(tools).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Text colour' })).toBeInTheDocument();
  });

  it('turns bold, italic and underline on for what you type next', async () => {
    renderWithProviders(<SignatureEditor value={signature} onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole('textbox', { name: 'Signature' }));
    for (const name of ['Bold', 'Italic', 'Underline']) {
      const button = screen.getByRole('button', { name });
      await userEvent.click(button);
      await waitFor(() => {
        expect(button).toHaveAttribute('aria-pressed', 'true');
      });
    }
  });
});
