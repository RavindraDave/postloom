import { compileMjml } from '@postloom/email';
import { Liquid } from 'liquidjs';
import { describe, expect, it } from 'vitest';
import {
  collectAssetIds,
  collectFields,
  usesDesignBlocks,
  writeDocumentSchema,
  type WriteDocument,
} from './document';
import { paymentReminder } from './fixtures';
import { conditionHolds, DEFAULT_BRAND, safeHref, writeDocumentToMjml } from './to-mjml';

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

describe('pictures and logo', () => {
  const withPicture = writeDocumentSchema.parse({
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
      {
        type: 'image',
        attrs: {
          assetId: 'a1b2',
          alt: 'Our shop',
          width: 480,
          align: 'left',
          href: 'https://shop.example.org',
        },
      },
      {
        type: 'image',
        attrs: { assetId: 'c3d4', alt: '', width: 200, href: 'javascript:alert(1)' },
      },
    ],
  });

  it('sends pictures inside the email and links them only to safe addresses', async () => {
    const mjml = writeDocumentToMjml(withPicture, {
      ...DEFAULT_BRAND,
      logo: { assetId: 'logo1', width: 400, alt: 'Brightlane' },
    });
    expect(mjml).toContain('src="cid:a1b2@postloom"');
    expect(mjml).toContain(
      'alt="Our shop" width="480px" align="left" href="https://shop.example.org/"',
    );
    expect(mjml).toContain('src="cid:c3d4@postloom" alt="" width="200px" align="center" padding');
    expect(mjml).not.toContain('javascript');
    // The logo comes first and is kept small.
    expect(mjml.indexOf('logo1@postloom')).toBeLessThan(mjml.indexOf('a1b2@postloom'));
    expect(mjml).toContain('alt="Brightlane" width="200px"');
    expect(collectAssetIds(withPicture)).toEqual(['a1b2', 'c3d4']);
    const { warnings } = await compileMjml(mjml);
    expect(warnings).toEqual([]);
  });

  it('uses app addresses for previews', () => {
    const mjml = writeDocumentToMjml(
      withPicture,
      DEFAULT_BRAND,
      'placeholder',
      (id) => `app://postloom/assets/${id}`,
    );
    expect(mjml).toContain('src="app://postloom/assets/a1b2"');
  });

  it('refuses picture ids that could break out of the address', () => {
    expect(
      writeDocumentSchema.safeParse({
        type: 'doc',
        content: [{ type: 'image', attrs: { assetId: '"><script>', alt: '', width: 100 } }],
      }).success,
    ).toBe(false);
    const mjml = writeDocumentToMjml(withPicture, {
      ...DEFAULT_BRAND,
      logo: { assetId: '"><x', width: 10, alt: '' },
    });
    expect(mjml).not.toContain('"><x');
  });
});

describe('Design mode blocks', () => {
  const para = (text: string) => ({
    type: 'paragraph' as const,
    content: [{ type: 'text' as const, text }],
  });
  const design = writeDocumentSchema.parse({
    type: 'doc',
    content: [
      para('Hello'),
      {
        type: 'columns',
        content: [
          { type: 'column', content: [para('Left side')] },
          {
            type: 'column',
            content: [
              { type: 'button', attrs: { label: 'Book', href: 'https://example.org/book' } },
            ],
          },
        ],
      },
      {
        type: 'table',
        attrs: { striped: true },
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableHeader', content: [para('Item')] },
              { type: 'tableHeader', content: [para('Price')] },
            ],
          },
          {
            type: 'tableRow',
            content: [
              { type: 'tableCell', content: [para('Tea')] },
              {
                type: 'tableCell',
                content: [
                  { type: 'paragraph', content: [{ type: 'field', attrs: { name: 'Price' } }] },
                ],
              },
            ],
          },
          {
            type: 'tableRow',
            content: [{ type: 'tableCell', attrs: { colspan: 2 }, content: [para('Thank you')] }],
          },
        ],
      },
      {
        type: 'conditional',
        attrs: { field: 'Discount', op: 'notEmpty' },
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Your discount: ' },
              { type: 'field', attrs: { name: 'Discount' } },
            ],
          },
        ],
      },
      {
        type: 'conditional',
        attrs: { field: 'Plan', op: 'equals', value: 'Gold' },
        content: [para('Gold members get free delivery.')],
      },
      { type: 'spacer', attrs: { height: 24 } },
      { type: 'footer', content: [{ type: 'text', text: '12 High Street, Pune' }] },
    ],
  });

  it('compiles cleanly, with columns in their own section', async () => {
    const mjml = writeDocumentToMjml(design);
    expect(mjml.match(/<mj-section/g)).toHaveLength(3);
    expect(mjml).toContain('<mj-column padding="0 8px">');
    expect(mjml).toContain('<mj-table');
    expect(mjml).toContain('colspan="2"');
    expect(mjml).toContain('background-color:#F6F7F9');
    expect(mjml).toContain('<mj-spacer height="24px" />');
    const { warnings } = await compileMjml(mjml);
    expect(warnings).toEqual([]);
  });

  it('shows "show only if" parts only to the right people when sending', async () => {
    const { html } = await compileMjml(writeDocumentToMjml(design));
    const engine = new Liquid({
      outputEscape: 'escape',
      strictFilters: true,
      ownPropertyOnly: true,
    });
    const render = (row: Record<string, string>) =>
      engine.parseAndRender(html, { row }) as Promise<string>;

    const gold = await render({ Price: '2', Discount: '10%', Plan: ' gold ' });
    expect(gold).toContain('Your discount: 10%');
    expect(gold).toContain('Gold members get free delivery.');

    const plain = await render({ Price: '2', Discount: '', Plan: 'Silver' });
    expect(plain).not.toContain('Your discount');
    expect(plain).not.toContain('Gold members');
  });

  it('decides the same way with example values in the preview', () => {
    const preview = writeDocumentToMjml(design, DEFAULT_BRAND, {
      values: { Price: '2', Discount: '', Plan: 'GOLD' },
    });
    expect(preview).not.toContain('Your discount');
    expect(preview).toContain('Gold members get free delivery.');
    expect(preview).not.toContain('{%');
    expect(
      conditionHolds({ field: 'Plan', op: 'notEquals', value: 'Gold' }, { Plan: 'gold' }),
    ).toBe(false);
    expect(conditionHolds({ field: 'X', op: 'isEmpty' }, {})).toBe(true);
  });

  it('shows every part in placeholder previews and tests', () => {
    const mjml = writeDocumentToMjml(design, DEFAULT_BRAND, 'placeholder');
    expect(mjml).toContain('Your discount: [Discount]');
    expect(mjml).toContain('Gold members');
    expect(mjml).not.toContain('{%');
  });

  it('knows which details and blocks the design uses', () => {
    expect(collectFields(design)).toEqual(['Price', 'Discount', 'Plan']);
    expect(usesDesignBlocks(design)).toBe(true);
    expect(usesDesignBlocks(paymentReminder)).toBe(false);
  });

  it('needs a value for "is exactly" rules, and refuses unsafe values', () => {
    const rule = (attrs: object) =>
      writeDocumentSchema.safeParse({
        type: 'doc',
        content: [{ type: 'conditional', attrs, content: [para('x')] }],
      }).success;
    expect(rule({ field: 'Plan', op: 'equals' })).toBe(false);
    expect(rule({ field: 'Plan', op: 'equals', value: 'Gold" or 1' })).toBe(false);
    expect(rule({ field: 'Plan', op: 'equals', value: 'Gold' })).toBe(true);
  });
});
