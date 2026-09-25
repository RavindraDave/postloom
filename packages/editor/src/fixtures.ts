import type { WriteDocument } from './document';

/** The "Payment reminder" letter from the design prototype. */
export const paymentReminder: WriteDocument = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Dear ' },
        { type: 'field', attrs: { name: 'First Name', fallback: 'there' } },
        { type: 'text', text: ',' },
      ],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Just a gentle reminder that invoice ' },
        { type: 'field', attrs: { name: 'Invoice No' } },
        { type: 'text', text: ' for ' },
        { type: 'field', attrs: { name: 'Amount' } },
        { type: 'text', text: ' is due soon.', marks: [{ type: 'bold' }] },
      ],
    },
    { type: 'button', attrs: { label: 'Pay now', href: 'https://pay.example.com/' } },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Warm regards,' },
        { type: 'hardBreak' },
        { type: 'text', text: 'Asha' },
      ],
    },
  ],
};
