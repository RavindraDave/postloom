import { getSchema } from '@tiptap/core';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { describe, expect, it } from 'vitest';
import { fromEditorJson } from './document';
import { paymentReminder } from './fixtures';
import { STARTER_GALLERY } from './starters';
import { writeModeExtensions } from './tiptap';

// Feasibility check for Write mode (Council step 5): TipTap must accept field
// chips inline in text, and its JSON must match what we validate and convert.

describe('Write mode editor schema', () => {
  const schema = getSchema(writeModeExtensions);

  it('keeps text colour and highlight through the editor', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Due now',
              marks: [
                { type: 'bold' },
                { type: 'textColor', attrs: { color: '#B42318' } },
                { type: 'highlight', attrs: { color: '#FFF4A3' } },
              ],
            },
          ],
        },
      ],
    };
    const node = ProseMirrorNode.fromJSON(schema, doc);
    node.check();
    expect(fromEditorJson(node.toJSON())).toEqual(doc);
  });

  it('treats fields as inline, atomic chips', () => {
    const field = schema.nodes['field'];
    expect(field?.isInline).toBe(true);
    expect(field?.isAtom).toBe(true);
  });

  it('loads the prototype letter and gives back the same JSON', () => {
    const node = ProseMirrorNode.fromJSON(schema, paymentReminder);
    node.check();

    expect(fromEditorJson(node.toJSON())).toEqual(paymentReminder);
  });

  it('round-trips every starter, including alignment, numbered lists and dividers', () => {
    for (const starter of STARTER_GALLERY) {
      const node = ProseMirrorNode.fromJSON(schema, starter.document);
      node.check();
      // The editor holds the words; the template's look (attrs) is kept alongside it.
      expect(fromEditorJson(node.toJSON())).toEqual({
        type: 'doc',
        content: starter.document.content,
      });
    }
    const extras = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { textAlign: 'center' },
          content: [{ type: 'text', text: 'Hi' }],
        },
        {
          type: 'orderedList',
          attrs: { start: 3 },
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Three' }] },
                {
                  type: 'bulletList',
                  content: [
                    {
                      type: 'listItem',
                      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nested' }] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        { type: 'horizontalRule' },
      ],
    };
    const node = ProseMirrorNode.fromJSON(schema, extras);
    node.check();
    expect(fromEditorJson(node.toJSON())).toEqual(extras);
  });

  it('round-trips Design-mode blocks: columns, tables, show-only-if, spacer, footer', () => {
    const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
    const design = {
      type: 'doc',
      content: [
        {
          type: 'columns',
          content: [
            { type: 'column', content: [para('Left')] },
            { type: 'column', content: [para('Right'), { type: 'spacer', attrs: { height: 16 } }] },
          ],
        },
        {
          type: 'table',
          attrs: { striped: true },
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1 }, content: [para('Item')] },
                {
                  type: 'tableHeader',
                  attrs: { colspan: 1, rowspan: 1 },
                  content: [para('Price')],
                },
              ],
            },
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [para('Tea')] },
                { type: 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [para('2')] },
              ],
            },
          ],
        },
        {
          type: 'conditional',
          attrs: { field: 'Discount', op: 'notEmpty' },
          content: [para('You get a discount!')],
        },
        { type: 'footer', content: [{ type: 'text', text: '12 High Street' }] },
      ],
    };
    const node = ProseMirrorNode.fromJSON(schema, design);
    node.check();
    expect(fromEditorJson(node.toJSON())).toEqual(design);
  });

  it('keeps only the link address from the editor', () => {
    const doc = fromEditorJson({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'site',
              marks: [
                {
                  type: 'link',
                  attrs: {
                    href: 'https://x.example',
                    target: '_blank',
                    rel: 'noopener',
                    class: null,
                  },
                },
              ],
            },
          ],
        },
      ],
    });
    expect(doc.content[0]).toEqual({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'site',
          marks: [{ type: 'link', attrs: { href: 'https://x.example' } }],
        },
      ],
    });
  });

  it('leaves out formatting that email clients render badly', () => {
    expect(schema.nodes['codeBlock']).toBeUndefined();
    expect(schema.nodes['blockquote']).toBeUndefined();
    expect(schema.marks['strike']).toBeUndefined();
  });
});
