import { Mark, mergeAttributes, Node, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Table, TableCell, TableHeader, TableRow, TableView } from '@tiptap/extension-table';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import { readableTextOn } from './to-mjml';
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

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Reads a CSS colour as #RRGGBB, or null (so only plain colours come in on paste). */
function hexFrom(value: string | null | undefined): string | null {
  const text = (value ?? '').trim();
  if (HEX.test(text)) return text.toUpperCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(text);
  if (short)
    return `#${short
      .slice(1)
      .map((c) => `${c}${c}`)
      .join('')}`.toUpperCase();
  const rgb =
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*1(?:\.0+)?\s*)?\)$/i.exec(text);
  if (!rgb) return null;
  const parts = rgb.slice(1, 4).map(Number);
  if (parts.some((part) => part > 255)) return null;
  return `#${parts.map((part) => part.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** Text pasted from web pages and Word is mostly near-black; that's the normal text colour. */
function isNearBlack(color: string): boolean {
  return [1, 3, 5].every((at) => parseInt(color.slice(at, at + 2), 16) <= 0x40);
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    emailColours: {
      /** Colours the selected text, or removes its colour with null. */
      setTextColour: (color: string | null) => ReturnType;
      /** Highlights the selected text, or removes the highlight with null. */
      setHighlightColour: (color: string | null) => ReturnType;
    };
  }
}

/** Text colour, stored as #RRGGBB. */
export const TextColorMark = Mark.create({
  name: 'textColor',
  addAttributes() {
    return { color: { default: null } };
  },
  parseHTML() {
    return [
      {
        tag: 'span[style]',
        getAttrs: (element) => {
          const color = hexFrom(element.style.color);
          return color && !isNearBlack(color) ? { color } : false;
        },
      },
      {
        tag: 'font[color]',
        getAttrs: (element) => {
          const color = hexFrom(element.getAttribute('color'));
          return color && !isNearBlack(color) ? { color } : false;
        },
      },
    ];
  },
  renderHTML({ mark }) {
    const color = String(mark.attrs['color'] ?? '');
    return ['span', HEX.test(color) ? { style: `color:${color}` } : {}, 0];
  },
  addCommands() {
    return {
      setTextColour:
        (color) =>
        ({ commands }) =>
          color && HEX.test(color)
            ? commands.setMark(this.name, { color: color.toUpperCase() })
            : commands.unsetMark(this.name),
    };
  },
});

/** A highlighter behind text, stored as #RRGGBB. */
export const HighlightMark = Mark.create({
  name: 'highlight',
  addAttributes() {
    return { color: { default: null } };
  },
  parseHTML() {
    return [
      {
        tag: 'mark',
        getAttrs: (element) => ({ color: hexFrom(element.style.backgroundColor) ?? '#FFF4A3' }),
      },
      {
        tag: 'span[style]',
        getAttrs: (element) => {
          const color = hexFrom(element.style.backgroundColor);
          // White and transparent backgrounds pasted from web pages aren't highlights.
          return color && color !== '#FFFFFF' ? { color } : false;
        },
      },
    ];
  },
  renderHTML({ mark }) {
    const color = String(mark.attrs['color'] ?? '');
    return ['mark', HEX.test(color) ? { style: `background-color:${color};color:inherit` } : {}, 0];
  },
  addCommands() {
    return {
      setHighlightColour:
        (color) =>
        ({ commands }) =>
          color && HEX.test(color)
            ? commands.setMark(this.name, { color: color.toUpperCase() })
            : commands.unsetMark(this.name),
    };
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

/** A data-* attribute that holds a table setting (null when it isn't set). */
const dataAttribute = (name: string, dataName = name) => ({
  default: null,
  parseHTML: (element: HTMLElement) => element.getAttribute(`data-${dataName}`),
  renderHTML: (attributes: Record<string, unknown>) => {
    const value = attributes[name];
    return typeof value === 'string' ? { [`data-${dataName}`]: value } : {};
  },
});

/** Puts a table's look on its element in the editor, where the CSS picks it up. */
function showTableLook(table: HTMLTableElement, node: ProseMirrorNode): void {
  for (const name of ['borders', 'spacing'] as const) {
    const value = node.attrs[name] as string | null;
    if (value) table.setAttribute(`data-${name}`, value);
    else table.removeAttribute(`data-${name}`);
  }
  table.setAttribute('data-striped', String(Boolean(node.attrs['striped'])));
  if (node.attrs['fit']) table.setAttribute('data-fit', 'true');
  else table.removeAttribute('data-fit');
  for (const [attr, property] of [
    ['borderColor', '--pl-table-line'],
    ['headerColor', '--pl-table-header'],
  ] as const) {
    const colour = String(node.attrs[attr]);
    if (HEX.test(colour)) table.style.setProperty(property, colour);
    else table.style.removeProperty(property);
  }
  const header = String(node.attrs['headerColor']);
  if (HEX.test(header)) table.style.setProperty('--pl-table-header-text', readableTextOn(header));
  else table.style.removeProperty('--pl-table-header-text');
}

/** The editor's table, with its column sizing (from TipTap) and its look. */
class EmailTableView extends TableView {
  constructor(
    node: ProseMirrorNode,
    cellMinWidth: number,
    view: EditorView,
    HTMLAttributes?: Record<string, unknown>,
  ) {
    super(node, cellMinWidth, view, HTMLAttributes);
    showTableLook(this.table, node);
  }

  override update(node: ProseMirrorNode): boolean {
    if (!super.update(node)) return false;
    showTableLook(this.table, node);
    return true;
  }
}

/**
 * Tables hold plain paragraphs in each cell, which every email app can show.
 * Their look (lines, colours, spacing, width) is kept as attributes and shown
 * in the editor through data-* attributes and the header colour.
 */
export const EmailTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      striped: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-striped') === 'true',
        renderHTML: (attributes) => ({ 'data-striped': String(Boolean(attributes['striped'])) }),
      },
      borders: dataAttribute('borders'),
      borderColor: dataAttribute('borderColor', 'border-color'),
      headerColor: dataAttribute('headerColor', 'header-color'),
      spacing: dataAttribute('spacing'),
      fit: {
        default: null,
        parseHTML: (element) => (element.getAttribute('data-fit') === 'true' ? true : null),
        renderHTML: (attributes) => (attributes['fit'] ? { 'data-fit': 'true' } : {}),
      },
    };
  },
  renderHTML({ node, HTMLAttributes }) {
    const parent = this.parent?.({ node, HTMLAttributes });
    // Colours reach the editor's CSS as custom properties (validated hex only).
    const colours = [
      HEX.test(String(node.attrs['borderColor'])) &&
        `--pl-table-line:${String(node.attrs['borderColor'])}`,
      HEX.test(String(node.attrs['headerColor'])) &&
        `--pl-table-header:${String(node.attrs['headerColor'])}`,
    ].filter(Boolean);
    if (!parent || colours.length === 0 || !Array.isArray(parent)) return parent as never;
    const [tag, attrs, ...rest] = parent as [string, Record<string, unknown>, ...unknown[]];
    const style = [attrs['style'], ...colours].filter(Boolean).join(';');
    return [tag, { ...attrs, style }, ...rest] as never;
  },
}).configure({
  resizable: true,
  lastColumnResizable: false,
  cellMinWidth: 40,
  View: EmailTableView,
});

/** Cell settings every cell type shares: vertical alignment and background colour. */
const cellAttributes = {
  valign: {
    default: null,
    parseHTML: (element: HTMLElement) => element.getAttribute('data-valign'),
    renderHTML: (attributes: Record<string, unknown>) => {
      const valign = attributes['valign'];
      return valign === 'top' || valign === 'middle' || valign === 'bottom'
        ? { 'data-valign': valign, style: `vertical-align:${valign}` }
        : {};
    },
  },
  background: {
    default: null,
    parseHTML: (element: HTMLElement) => element.getAttribute('data-background'),
    renderHTML: (attributes: Record<string, unknown>) => {
      const colour = String(attributes['background']);
      return HEX.test(colour)
        ? { 'data-background': colour, style: `background-color:${colour}` }
        : {};
    },
  },
};

export const EmailTableCell = TableCell.extend({
  content: 'paragraph+',
  addAttributes() {
    return { ...this.parent?.(), ...cellAttributes };
  },
});
export const EmailTableHeader = TableHeader.extend({
  content: 'paragraph+',
  addAttributes() {
    return { ...this.parent?.(), ...cellAttributes };
  },
});

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
  TextColorMark,
  HighlightMark,
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
