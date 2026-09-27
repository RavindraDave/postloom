// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { importHtml } from './import-html';

describe('importing an HTML email', () => {
  it('keeps text, headings, lists and links, and reads the title', () => {
    const result = importHtml(`
      <html><head><title>Spring news</title><style>p{color:red}</style></head>
      <body>
        <h1>Hello</h1>
        <p>Read <a href="https://shop.example.org">our shop</a>.</p>
        <ul><li>One</li><li>Two</li></ul>
      </body></html>`);
    expect(result.title).toBe('Spring news');
    expect(result.textOnly).toBe(false);
    expect(result.document.content.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'bulletList',
    ]);
    expect(JSON.stringify(result.document)).toContain('https://shop.example.org');
    expect(JSON.stringify(result.document)).not.toContain('color:red');
  });

  it('never keeps scripts, event handlers, forms or dangerous links', () => {
    const result = importHtml(`
      <p onclick="steal()">Hi <a href="javascript:alert(1)">click</a></p>
      <script>alert(1)</script>
      <form action="https://evil.example"><input name="password"></form>
      <iframe src="https://evil.example"></iframe>`);
    const json = JSON.stringify(result.document);
    expect(json).not.toMatch(/steal|alert|evil|password/);
    expect(json).toContain('Hi');
  });

  it('counts web pictures it leaves out', () => {
    const result = importHtml('<p>Logo:</p><img src="https://tracker.example/pixel.gif" alt="">');
    expect(result.picturesLeftOut).toBe(1);
    expect(JSON.stringify(result.document)).not.toContain('tracker');
  });

  it('unwraps layout tables but keeps real data tables', () => {
    const result = importHtml(`
      <table width="600"><tr><td>
        <h2>Invoice</h2>
        <table><tr><th>Item</th><th>Price</th></tr><tr><td>Tea</td><td>2</td></tr></table>
        <p>Thanks!</p>
      </td></tr></table>`);
    expect(result.document.content.map((block) => block.type)).toEqual([
      'heading',
      'table',
      'paragraph',
    ]);
    expect(result.needsDesign).toBe(true);
  });

  it('keeps personal details that use Postloom markers, but typed braces stay text', () => {
    const result = importHtml(
      '<p>Dear <span data-field="First Name">First Name</span>, {{ row.secret }}</p>',
    );
    const paragraph = result.document.content[0];
    expect(paragraph).toMatchObject({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Dear ' },
        { type: 'field', attrs: { name: 'First Name' } },
        { type: 'text', text: ', {{ row.secret }}' },
      ],
    });
  });

  it('turns placeholders from other tools and Word into details', () => {
    const result = importHtml(
      '<p>Dear {{First Name}}, invoice [Invoice No] of «Amount» is due. [see the attached note for details] {{ name | upcase }}</p>',
    );
    expect(result.details).toEqual(['First Name', 'Invoice No', 'Amount']);
    expect(result.document.content[0]).toMatchObject({
      content: [
        { type: 'text', text: 'Dear ' },
        { type: 'field', attrs: { name: 'First Name' } },
        { type: 'text', text: ', invoice ' },
        { type: 'field', attrs: { name: 'Invoice No' } },
        { type: 'text', text: ' of ' },
        { type: 'field', attrs: { name: 'Amount' } },
        {
          type: 'text',
          text: ' is due. [see the attached note for details] {{ name | upcase }}',
        },
      ],
    });
  });

  it('keeps only the pictures the app stored from the file', () => {
    const result = importHtml(
      '<p>Hi</p><img data-asset="a1b2" width="480" alt="Our shop" onerror="x()">' +
        '<img src="https://tracker.example/pixel.png"><img data-asset="made-up">',
      { assetIds: ['a1b2'] },
    );
    const pictures = result.document.content.filter((block) => block.type === 'image');
    expect(pictures).toEqual([
      { type: 'image', attrs: { assetId: 'a1b2', alt: 'Our shop', width: 480 } },
    ]);
    expect(result.picturesLeftOut).toBe(2);
  });

  it('keeps Word tables, even with paragraphs in their cells', () => {
    const word =
      '<table><tr><td><p>Item</p></td><td><p>Amount</p></td></tr>' +
      '<tr><td><p>Design</p></td><td><p>12400</p></td></tr></table>';
    expect(importHtml(word, { kind: 'docx' }).needsDesign).toBe(true);
    // The same markup in an HTML email reads as layout.
    expect(importHtml(word).needsDesign).toBe(false);
  });
});
