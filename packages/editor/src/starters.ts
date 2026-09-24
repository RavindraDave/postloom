import type { WriteDocument } from './document';

/** The letter a new template starts with, so people edit rather than face a blank page. */
export const STARTER_LETTER: WriteDocument = {
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
        {
          type: 'text',
          text: 'Write your message here. Personal details from your list, like the name above, are filled in for each person.',
        },
      ],
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Kind regards,' }],
    },
  ],
};
