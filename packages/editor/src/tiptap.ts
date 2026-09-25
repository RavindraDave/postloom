import { mergeAttributes, Node, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
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

// ------------------------------------------------------------ Design mode

/** Blocks that can sit in a column or a "show only if" part. */
const SIMPLE_BLOCKS =
  'paragraph | heading | bulletList | orderedList | button | image | horizontalRule | spacer';

/** Blank space between parts of the email. */
export const SpacerNode = Node.create({
  name: 'spacer',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes: () => ({ height: { default: 24 } }),
  parseHTML: () => [{ tag: 'div[data-spacer]' }],
  renderHTML: ({ node }) => [
    'div',
    {
      'data-spacer': '',
      class: 'pl-spacer',
      style: `height:${String(Number(node.attrs['height']) || 24)}px`,
    },
  ],
});

/** Small, quiet text at the bottom of the email. */
export const FooterNode = Node.create({
  name: 'footer',
  group: 'block',
  content: 'inline*',
  defining: true,
  parseHTML: () => [{ tag: 'div[data-footer]' }, { tag: 'footer' }],
  renderHTML: () => ['div', { 'data-footer': '', class: 'pl-footer' }, 0],
});

/** Side-by-side columns; on phones they stack. */
export const ColumnsNode = Node.create({
  name: 'columns',
  group: 'block',
  content: 'column{2,4}',
  isolating: true,
  parseHTML: () => [{ tag: 'div[data-columns]' }],
  renderHTML: ({ node }) => [
    'div',
    { 'data-columns': String(node.childCount), class: 'pl-columns' },
    0,
  ],
});

export const ColumnNode = Node.create({
  name: 'column',
  content: `(${SIMPLE_BLOCKS})+`,
  isolating: true,
  parseHTML: () => [{ tag: 'div[data-column]' }],
  renderHTML: () => ['div', { 'data-column': '', class: 'pl-column' }, 0],
});

/** A part of the email shown only to some people ("show only if"). */
export const ConditionalNode = Node.create({
  name: 'conditional',
  group: 'block',
  content: `(${SIMPLE_BLOCKS} | table)+`,
  isolating: true,
  defining: true,
  addAttributes: () => ({
    field: { default: '' },
    op: { default: 'notEmpty' },
    value: { default: '' },
  }),
  parseHTML: () => [
    {
      tag: 'div[data-conditional]',
      getAttrs: (element) => ({
        field: element.getAttribute('data-field') ?? '',
        op: element.getAttribute('data-op') ?? 'notEmpty',
        value: element.getAttribute('data-value') ?? '',
      }),
    },
  ],
  renderHTML: ({ node }) => [
    'div',
    {
      'data-conditional': '',
      'data-field': String(node.attrs['field']),
      'data-op': String(node.attrs['op']),
      'data-value': String(node.attrs['value']),
      class: 'pl-conditional',
    },
    0,
  ],
});

/** Tables hold plain paragraphs in each cell, which every email app can show. */
export const EmailTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      striped: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-striped') === 'true',
        renderHTML: (attributes) => ({ 'data-striped': String(Boolean(attributes['striped'])) }),
      },
    };
  },
}).configure({ resizable: false });
export const EmailTableCell = TableCell.extend({ content: 'paragraph+' });
export const EmailTableHeader = TableHeader.extend({ content: 'paragraph+' });

export const designExtensions = [
  SpacerNode,
  FooterNode,
  ColumnsNode,
  ColumnNode,
  ConditionalNode,
  EmailTable,
  TableRow,
  EmailTableCell,
  EmailTableHeader,
];

/**
 * Everything the editor understands. Write and Design mode share one schema,
 * so a document always opens; Design mode only adds tools for more blocks.
 */
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
  ...designExtensions,
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
