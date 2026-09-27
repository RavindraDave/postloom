import { writeDocumentToMjml, type WriteDocument } from '@postloom/editor';
import { compileMjml } from '@postloom/email';
import { describe, expect, it } from 'vitest';
import { createPersonaliser } from './personalise';

const doc: WriteDocument = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Dear ' },
        { type: 'field', attrs: { name: 'First Name', fallback: 'friend' } },
        { type: 'text', text: ', you owe {{ nothing }}.' },
      ],
    },
  ],
};

describe('personalise', () => {
  it('compiles once and fills in each person’s details, escaped', async () => {
    const { html } = await compileMjml(writeDocumentToMjml(doc));
    const personalise = createPersonaliser({
      html,
      subject: 'Hi {{First Name}}',
      fallbackSubject: 'Hello',
    });

    const rahul = await personalise({ 'First Name': 'Rahul' });
    expect(rahul.subject).toBe('Hi Rahul');
    expect(rahul.html).toContain('Dear Rahul,');
    expect(rahul.text).toContain('Dear Rahul,');
    // Braces people typed stay text (encoded), never a Liquid tag.
    expect(rahul.html).toContain('&#123;&#123; nothing &#125;&#125;');
    expect(rahul.text).toContain('you owe {{ nothing }}.');

    const sneaky = await personalise({ 'First Name': '<script>alert(1)</script>' });
    expect(sneaky.html).not.toContain('<script>');
    expect(sneaky.html).toContain('&lt;script&gt;');

    const empty = await personalise({});
    expect(empty.html).toContain('Dear friend,');
    expect(empty.subject).toBe('Hi');
  });

  it('shows dates and amounts in the template’s formats, in the subject and the letter', async () => {
    const invoice: WriteDocument = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'field', attrs: { name: 'Amount' } },
            { type: 'text', text: ' is due on ' },
            { type: 'field', attrs: { name: 'Due Date' } },
          ],
        },
      ],
    };
    const { html } = await compileMjml(writeDocumentToMjml(invoice));
    const personalise = createPersonaliser({
      html,
      subject: 'Due {{Due Date}}',
      fallbackSubject: 'Invoice',
      formats: { Amount: 'money-inr-0', 'Due Date': 'date-long' },
    });

    const email = await personalise({ Amount: '12400', 'Due Date': '2026-10-01' });
    expect(email.subject).toBe('Due 1 October 2026');
    expect(email.html).toContain('₹12,400 is due on 1 October 2026');
    // A value that isn't a date stays as it is.
    expect((await personalise({ Amount: '', 'Due Date': 'on receipt' })).subject).toBe(
      'Due on receipt',
    );
  });

  it('uses the fallback subject when the subject comes out empty', async () => {
    const personalise = createPersonaliser({
      html: '<p></p>',
      subject: '{{Code}}',
      fallbackSubject: 'Hello',
    });
    expect((await personalise({})).subject).toBe('Hello');
  });

  it('can’t reach anything but the row’s own details', async () => {
    const personalise = createPersonaliser({
      html: '<p>{{ row.constructor }}{{ row["__proto__"] }}</p>',
      subject: 'x',
      fallbackSubject: 'x',
    });
    expect((await personalise({})).html).toBe('<p></p>');
  });
});
