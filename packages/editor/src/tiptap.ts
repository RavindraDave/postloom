import { mergeAttributes, Node, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import type { WriteDocument } from './document';
import { formatSubject, parseSubject, type SubjectPart } from './subject';

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

/** Where the app serves stored pictures (see the main process's app protocol). */
export const APP_ASSET_URL_PREFIX = 'app://postloom/assets/';

/** A stored picture in the letter. Its bytes are served by the app, never fetched from the web. */
export const ImageNode = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      assetId: { default: '' },
      alt: { default: '' },
      width: { default: 300 },
      align: { default: null },
      href: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'img[data-asset]',
        getAttrs: (element) => ({
          assetId: element.getAttribute('data-asset') ?? '',
          alt: element.getAttribute('alt') ?? '',
          width: Number(element.getAttribute('width') ?? 300),
        }),
      },
    ];
  },

  renderHTML({ node }) {
    const assetId = String(node.attrs['assetId']);
    const align = (node.attrs['align'] as string | null) ?? 'center';
    return [
      'div',
      { class: 'pl-image', 'data-align': align },
      [
        'img',
        {
          src: /^[A-Za-z0-9-]+$/.test(assetId) ? `${APP_ASSET_URL_PREFIX}${assetId}` : '',
          alt: String(node.attrs['alt']),
          width: String(node.attrs['width']),
          'data-asset': assetId,
        },
      ],
    ];
  },
});

export const writeModeExtensions = [
  StarterKit.configure({
    // Keep Write mode to what email clients render reliably.
    blockquote: false,
    code: false,
    codeBlock: false,
    strike: false,
    heading: { levels: [1, 2, 3] },
    link: {
      openOnClick: false,
      autolink: true,
      protocols: ['http', 'https', 'mailto'],
      defaultProtocol: 'https',
    },
  }),
  TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right'] }),
  FieldNode,
  ButtonNode,
  ImageNode,
];

/**
 * A stored document as editor content. Every `WriteDocument` is valid TipTap
 * JSON (the schema is a strict subset); the types differ only in how they
 * spell optional properties.
 */
export function toEditorContent(doc: WriteDocument): JSONContent {
  return doc as JSONContent;
}

// ------------------------------------------------------------ Subject line

/**
 * The subject line is a tiny one-line editor: text plus detail chips, no
 * formatting and no new lines.
 */
const SubjectDocument = Node.create({ name: 'doc', topNode: true, content: 'subjectLine' });
const SubjectLine = Node.create({
  name: 'subjectLine',
  content: '(text | field)*',
  parseHTML: () => [{ tag: 'p' }],
  renderHTML: () => ['p', 0],
});
const SubjectText = Node.create({ name: 'text', group: 'inline' });

export const subjectExtensions = [SubjectDocument, SubjectLine, SubjectText, FieldNode];

/** A stored subject as subject-editor content. */
export function subjectToEditorContent(subject: string): JSONContent {
  const content = parseSubject(subject).flatMap((part): JSONContent[] =>
    part.type === 'field'
      ? [{ type: 'field', attrs: { name: part.name, fallback: '' } }]
      : part.text
        ? [{ type: 'text', text: part.text }]
        : [],
  );
  return { type: 'doc', content: [{ type: 'subjectLine', content }] };
}

/** The subject editor's content as a stored subject. */
export function subjectFromEditorJson(json: JSONContent): string {
  const parts: SubjectPart[] = (json.content?.[0]?.content ?? []).flatMap((node): SubjectPart[] => {
    if (node.type === 'field') {
      const name = String(node.attrs?.['name'] ?? '');
      return name ? [{ type: 'field', name }] : [];
    }
    return node.type === 'text' && node.text ? [{ type: 'text', text: node.text }] : [];
  });
  return formatSubject(parts);
}
