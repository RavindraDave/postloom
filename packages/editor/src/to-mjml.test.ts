import { compileMjml } from '@postloom/email';
import { Liquid } from 'liquidjs';
import { describe, expect, it } from 'vitest';
import { collectFields, writeDocumentSchema, type WriteDocument } from './document';
import { paymentReminder } from './fixtures';
import { safeHref, writeDocumentToMjml } from './to-mjml';

// Mirrors the personalisation settings planned for the sending engine:
// every output is HTML-escaped and unknown filters are errors.
const liquid = new Liquid({ outputEscape: 'escape', strictFilters: true, ownPropertyOnly: true });

async function personalise(doc: WriteDocument, row: Record<string, string>): Promise<string> {
  const { html } = await compileMjml(writeDocumentToMjml(doc));
  return (await liquid.parseAndRender(html, { row })) as string;
}

describe('writeDocumentToMjml', () => {
  it('produces MJML that compiles cleanly', async () => {
    const result = await compileMjml(writeDocumentToMjml(paymentReminder));

    expect(result.warnings).toEqual([]);
    expect(result.html).toContain('Pay now');
    expect(result.html).toContain('{{ row["First Name"] | default: "there" }}');
  });

  it('fills in each recipient’s details after compiling', async () => {
    const html = await personalise(paymentReminder, {
      'First Name': 'Rahul',
      'Invoice No': 'INV-1041',
      Amount: '₹ 18,400',
    });

    expect(html).toContain('Dear Rahul,');
    expect(html).toContain('invoice INV-1041 for ₹ 18,400');
    expect(html).not.toContain('{{');
  });

  it('uses the fallback when a detail is empty', async () => {
    const html = await personalise(paymentReminder, {
      'First Name': '',
      'Invoice No': 'X',
      Amount: '1',
    });

    expect(html).toContain('Dear there,');
  });

  it('escapes spreadsheet values so they cannot inject HTML', async () => {
    const html = await personalise(paymentReminder, {
      'First Name': '<img src=x onerror=alert(1)>',
      'Invoice No': 'X',
      Amount: '1',
    });

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x');
  });

  it('never turns typed text into personalisation code', async () => {
    const doc: WriteDocument = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Price: {{ row["Secret"] }} {% raw %}' }],
        },
      ],
    };

    const html = await personalise(doc, { Secret: 'LEAKED' });

    expect(html).not.toContain('LEAKED');
    expect(html).toContain('Price:');
  });

  it('escapes typed HTML', () => {
    const mjml = writeDocumentToMjml({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '<script>alert(1)</script>' }] },
      ],
    });

    expect(mjml).not.toContain('<script>');
    expect(mjml).toContain('&lt;script&gt;');
  });

  it('keeps only web and email links', () => {
    const mjml = writeDocumentToMjml({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'safe',
              marks: [{ type: 'link', attrs: { href: 'https://example.com/a?b=1' } }],
            },
            {
              type: 'text',
              text: 'unsafe',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
        { type: 'button', attrs: { label: 'Go', href: 'file:///etc/passwd' } },
      ],
    });

    expect(mjml).toContain('href="https://example.com/a?b=1"');
    expect(mjml).not.toContain('javascript:');
    expect(mjml).not.toContain('file:');
  });

  it('ignores unsafe brand values', () => {
    const mjml = writeDocumentToMjml(paymentReminder, {
      primaryColor: 'red" onload="x',
      backgroundColor: '#FFFFFF',
      fontFamily: 'Arial"><mj-raw>',
    });

    expect(mjml).not.toContain('onload');
    expect(mjml).not.toContain('<mj-raw>');
  });
});

describe('safeHref', () => {
  it.each([
    ['https://example.com', 'https://example.com/'],
    ['mailto:help@example.com', 'mailto:help@example.com'],
    ['javascript:alert(1)', null],
    ['data:text/html,hi', null],
    ['not a url', null],
  ])('%s -> %s', (input, expected) => {
    expect(safeHref(input)).toBe(expected);
  });
});

describe('writeDocumentSchema', () => {
  it('accepts the prototype letter', () => {
    expect(writeDocumentSchema.safeParse(paymentReminder).success).toBe(true);
  });

  it.each(['Name"]}}{{ evil', "O'Brien", 'Total %', '<b>'])(
    'rejects field names that could break out of personalisation: %s',
    (name) => {
      const doc = {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'field', attrs: { name } }] }],
      };
      expect(writeDocumentSchema.safeParse(doc).success).toBe(false);
    },
  );

  it('rejects unknown node types', () => {
    const doc = { type: 'doc', content: [{ type: 'iframe', attrs: { src: 'https://x' } }] };
    expect(writeDocumentSchema.safeParse(doc).success).toBe(false);
  });
});

describe('collectFields', () => {
  it('lists each detail once, in order of use', () => {
    expect(collectFields(paymentReminder)).toEqual(['First Name', 'Invoice No', 'Amount']);
  });
});

describe('formatting', () => {
  const doc: WriteDocument = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'September' }] },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [
                  { type: 'text', text: 'Due ', marks: [{ type: 'italic' }] },
                  { type: 'field', attrs: { name: 'Due Date' } },
                ],
              },
            ],
          },
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Late fee', marks: [{ type: 'underline' }] }],
              },
            ],
          },
        ],
      },
      { type: 'paragraph' },
    ],
  };

  it('renders headings, lists and marks', async () => {
    const mjml = writeDocumentToMjml(doc);
    expect(mjml).toContain('font-size="22px"');
    expect(mjml).toContain('<ul');
    expect(mjml).toContain('<em>Due </em>');
    expect(mjml).toContain('<u>Late fee</u>');
    expect((await compileMjml(mjml)).warnings).toEqual([]);
  });

  it('finds details used inside lists', () => {
    expect(collectFields(doc)).toEqual(['Due Date']);
  });
});

describe('STARTER_LETTER', () => {
  it('is valid and compiles cleanly', async () => {
    const { STARTER_LETTER } = await import('./starters');
    expect(writeDocumentSchema.safeParse(STARTER_LETTER).success).toBe(true);
    expect((await compileMjml(writeDocumentToMjml(STARTER_LETTER))).warnings).toEqual([]);
  });
});

describe('preview mode', () => {
  it('shows personal details as readable placeholders instead of code', () => {
    const mjml = writeDocumentToMjml(paymentReminder, undefined, 'placeholder');
    expect(mjml).toContain('Dear [First Name],');
    expect(mjml).not.toContain('{{');
  });
});

describe('alignment, numbered lists and dividers', () => {
  it('renders them as email-safe MJML', async () => {
    const doc = writeDocumentSchema.parse({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1, textAlign: 'center' },
          content: [{ type: 'text', text: 'Hello' }],
        },
        {
          type: 'paragraph',
          attrs: { textAlign: 'right' },
          content: [{ type: 'text', text: 'Right' }],
        },
        {
          type: 'orderedList',
          attrs: { start: 2 },
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'field', attrs: { name: 'Item' } }] },
                {
                  type: 'bulletList',
                  content: [
                    {
                      type: 'listItem',
                      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Sub' }] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        { type: 'horizontalRule' },
      ],
    });
    const mjml = writeDocumentToMjml(doc);
    expect(mjml).toContain('align="center"');
    expect(mjml).toContain('align="right"');
    expect(mjml).toContain('<ol start="2"');
    expect(mjml).toContain('<ul');
    expect(mjml).toContain('<mj-divider');
    expect(collectFields(doc)).toEqual(['Item']);
    const { warnings } = await compileMjml(mjml);
    expect(warnings).toEqual([]);
  });

  it('refuses lists nested too deeply', () => {
    let list: unknown = { type: 'paragraph', content: [{ type: 'text', text: 'x' }] };
    for (let depth = 0; depth < 6; depth++) {
      list = {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [{ type: 'paragraph' }, list] }],
      };
    }
    expect(writeDocumentSchema.safeParse({ type: 'doc', content: [list] }).success).toBe(false);
  });
});
