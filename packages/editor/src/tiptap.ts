import { mergeAttributes, Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

/**
 * TipTap extensions for Write mode. The editor's JSON output matches
 * `writeDocumentSchema`, so what the editor produces is exactly what gets
 * validated, stored and converted to MJML.
 */

/** A personal detail from the spreadsheet, shown as a chip inside text. */
export const FieldNode = Node.create({
  name: 'field',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      name: { default: '' },
      fallback: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-field]',
        getAttrs: (element) => ({
          name: element.getAttribute('data-field') ?? '',
          fallback: element.getAttribute('data-fallback') ?? '',
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const name = String(node.attrs['name']);
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-field': name,
        'data-fallback': String(node.attrs['fallback']),
        class: 'pl-field',
        contenteditable: 'false',
      }),
      name,
    ];
  },

  renderText({ node }) {
    return `[${String(node.attrs['name'])}]`;
  },
});

/** A call-to-action button, e.g. "Pay now". */
export const ButtonNode = Node.create({
  name: 'button',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      label: { default: 'Click here' },
      href: { default: 'https://' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-button]' }];
  },

  renderHTML({ node }) {
    return ['div', { 'data-button': '', class: 'pl-button' }, String(node.attrs['label'])];
  },
});

export const writeModeExtensions = [
  StarterKit.configure({
    // Keep Write mode to what email clients render reliably.
    blockquote: false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
    orderedList: false,
    strike: false,
    heading: { levels: [1, 2, 3] },
  }),
  FieldNode,
  ButtonNode,
];
