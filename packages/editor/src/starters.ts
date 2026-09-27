import type { ParagraphNode, WriteDocument } from './document';

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

export interface StarterTemplate {
  /** Stable id, also used for the i18n name/description keys. */
  id: string;
  name: string;
  description: string;
  subject: string;
  category: string;
  document: WriteDocument;
}

type Inline = NonNullable<
  Extract<WriteDocument['content'][number], { type: 'paragraph' }>['content']
>;

const text = (value: string, bold = false): Inline[number] =>
  bold ? { type: 'text', text: value, marks: [{ type: 'bold' }] } : { type: 'text', text: value };
const field = (name: string, fallback?: string): Inline[number] => ({
  type: 'field',
  attrs: fallback ? { name, fallback } : { name },
});
const paragraph = (...content: Inline): ParagraphNode => ({
  type: 'paragraph',
  content,
});
const heading = (value: string, level: 1 | 2 | 3 = 2): WriteDocument['content'][number] => ({
  type: 'heading',
  attrs: { level },
  content: [text(value)],
});
const button = (label: string, href: string): WriteDocument['content'][number] => ({
  type: 'button',
  attrs: { label, href },
});
const bullets = (...items: string[]): WriteDocument['content'][number] => ({
  type: 'bulletList',
  content: items.map((item) => ({ type: 'listItem', content: [paragraph(text(item))] })),
});
const divider: WriteDocument['content'][number] = { type: 'horizontalRule' };
const greeting = paragraph(text('Dear '), field('First Name', 'there'), text(','));
const signOff = (closing: string) =>
  paragraph(text(closing), { type: 'hardBreak' }, field('Your Name', 'The team'));

/** The starter gallery (PLAN §8.3): tested letters people change to their own words. */
export const STARTER_GALLERY: StarterTemplate[] = [
  {
    id: 'plainLetter',
    name: 'Plain letter',
    description: 'A simple personal letter. Start here if you are not sure.',
    subject: 'A note from us',
    category: 'General',
    document: STARTER_LETTER,
  },
  {
    id: 'paymentReminder',
    name: 'Payment reminder',
    description: 'A friendly nudge about an invoice that is due.',
    subject: 'A friendly reminder about your invoice',
    category: 'Money',
    document: {
      type: 'doc',
      content: [
        greeting,
        paragraph(
          text('Just a gentle reminder that invoice '),
          field('Invoice No'),
          text(' for '),
          field('Amount'),
          text(' is due on '),
          field('Due Date'),
          text('.'),
        ),
        paragraph(text('If you have already paid, thank you, and please ignore this email.')),
        button('Pay now', 'https://example.com/pay'),
        signOff('Warm regards,'),
      ],
    },
  },
  {
    id: 'invoice',
    name: 'Invoice',
    description: 'Send an invoice with the amount and due date.',
    subject: 'Your invoice from us',
    category: 'Money',
    document: {
      type: 'doc',
      content: [
        heading('Your invoice'),
        greeting,
        paragraph(text('Thank you for your business. Here are the details of your invoice:')),
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [paragraph(text('Invoice number: '), field('Invoice No'))],
            },
            { type: 'listItem', content: [paragraph(text('Amount: '), field('Amount'))] },
            { type: 'listItem', content: [paragraph(text('Due by: '), field('Due Date'))] },
          ],
        },
        button('View invoice', 'https://example.com/invoice'),
        paragraph(text('Any questions? Just reply to this email.')),
        signOff('Many thanks,'),
      ],
    },
  },
  {
    id: 'thankYou',
    name: 'Thank you',
    description: 'Say thank you after a purchase, visit or favour.',
    subject: 'Thank you!',
    category: 'General',
    document: {
      type: 'doc',
      content: [
        greeting,
        paragraph(
          text('Thank you so much', true),
          text(' for choosing us. It really means a lot.'),
        ),
        paragraph(
          text(
            'We hope you are happy with everything. If there is anything we can do better, just reply and let us know.',
          ),
        ),
        signOff('With thanks,'),
      ],
    },
  },
  {
    id: 'welcome',
    name: 'Welcome',
    description: 'Welcome a new customer, member or colleague.',
    subject: 'Welcome aboard!',
    category: 'People',
    document: {
      type: 'doc',
      content: [
        heading('Welcome!', 1),
        greeting,
        paragraph(text('We are delighted to have you with us. Here is what happens next:')),
        bullets(
          'We will be in touch within two working days.',
          'You can reply to this email any time with questions.',
          'Keep an eye out for our next update.',
        ),
        button('Get started', 'https://example.com/start'),
        signOff('See you soon,'),
      ],
    },
  },
  {
    id: 'announcement',
    name: 'Announcement',
    description: 'Share news: a new service, new hours or a change.',
    subject: 'Some news we wanted to share',
    category: 'News',
    document: {
      type: 'doc',
      attrs: { layout: 'card' },
      content: [
        heading('Big news'),
        greeting,
        paragraph(text('We have some exciting news to share with you.')),
        paragraph(text('Tell people what is changing, when, and what it means for them.')),
        button('Find out more', 'https://example.com/news'),
        signOff('Best wishes,'),
      ],
    },
  },
  {
    id: 'newsletter',
    name: 'Newsletter',
    description: 'A short update with a few stories.',
    subject: 'This month’s news',
    category: 'News',
    document: {
      type: 'doc',
      attrs: { layout: 'card' },
      content: [
        heading('This month', 1),
        paragraph(
          text('Hi '),
          field('First Name', 'there'),
          text(', here is what has been happening.'),
        ),
        divider,
        heading('First story', 3),
        paragraph(text('A few sentences about your first story.')),
        divider,
        heading('Second story', 3),
        paragraph(text('A few sentences about your second story.')),
        button('Read more', 'https://example.com/blog'),
        divider,
        signOff('Until next time,'),
      ],
    },
  },
  {
    id: 'eventInvite',
    name: 'Event invite',
    description: 'Invite people to an event and ask them to reply.',
    subject: 'You are invited!',
    category: 'People',
    document: {
      type: 'doc',
      attrs: { layout: 'card' },
      content: [
        {
          type: 'heading',
          attrs: { level: 1, textAlign: 'center' },
          content: [text('You are invited')],
        },
        greeting,
        paragraph(text('We would love you to join us.')),
        bullets(
          'When: Saturday 14 March, 6 pm',
          'Where: The Community Hall',
          'Dress: come as you are',
        ),
        button('Reply to say you are coming', 'mailto:events@example.com'),
        signOff('Hope to see you there,'),
      ],
    },
  },
];
