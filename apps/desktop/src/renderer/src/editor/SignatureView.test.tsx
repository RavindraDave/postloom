import type { SenderSignature } from '@postloom/editor';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test/render';
import { SignatureContext, SignatureView } from './SignatureView';

const signature: SenderSignature = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Asha Kapoor', marks: [{ type: 'bold' }] }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Accounts', marks: [{ type: 'italic' }, { type: 'underline' }] },
        { type: 'hardBreak' },
        {
          type: 'text',
          text: 'r2dsolutions.com',
          marks: [
            { type: 'link', attrs: { href: 'https://r2dsolutions.com' } },
            { type: 'textColor', attrs: { color: '#2F5D8C' } },
            { type: 'highlight', attrs: { color: '#FFF4A3' } },
          ],
        },
      ],
    },
    { type: 'paragraph' },
  ],
};

function show(value: { signature: SenderSignature | null; hasSender: boolean }) {
  renderWithProviders(
    <SignatureContext.Provider value={value}>
      <SignatureView />
    </SignatureContext.Provider>,
  );
}

describe('Signature block in the letter', () => {
  it("shows the sender's signature as it will be sent", () => {
    show({ signature, hasSender: true });
    const block = screen.getByTestId('letter-signature');
    expect(block.querySelector('strong')).toHaveTextContent('Asha Kapoor');
    expect(block.querySelector('u em')).toHaveTextContent('Accounts');
    expect(block.querySelector('span[style*="color"]')).toHaveTextContent('r2dsolutions.com');
    expect(block.querySelector('br')).not.toBeNull();
  });

  it('says what to do when there is no signature to show', () => {
    show({ signature: null, hasSender: true });
    expect(screen.getByText(/This sender has no signature yet/)).toBeInTheDocument();
  });

  it('asks for a sender first', () => {
    show({ signature: null, hasSender: false });
    expect(screen.getByText(/Choose who it’s from/)).toBeInTheDocument();
  });
});
