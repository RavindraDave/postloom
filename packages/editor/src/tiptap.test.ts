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
      expect(fromEditorJson(node.toJSON())).toEqual(starter.document);
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
