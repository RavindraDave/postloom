import { EMAIL_FONT_STACKS } from './fonts';
import { z } from 'zod';

/**
 * The Write-mode document: a small, strict subset of TipTap/ProseMirror JSON.
 * It is what gets stored for a template written in Write mode and is
 * validated whenever it crosses a trust boundary (IPC, database, import).
 */

/**
 * Column names from the recipients' spreadsheet. Quotes, braces and percent
 * signs are refused so a name can never break out of the Liquid expression
 * it is placed in (see `to-mjml.ts`).
 */
export const fieldNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[^"'{}%<>\\]+$/, 'Field names cannot contain quotes, braces, % or < >');

const markSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bold') }),
  z.object({ type: z.literal('italic') }),
  z.object({ type: z.literal('underline') }),
  z.object({ type: z.literal('link'), attrs: z.object({ href: z.string().max(2048) }) }),
]);

const textNodeSchema = z.object({
  type: z.literal('text'),
  text: z.string().min(1).max(10_000),
  marks: z.array(markSchema).max(8).optional(),
});

const fieldNodeSchema = z.object({
  type: z.literal('field'),
  attrs: z.object({
    name: fieldNameSchema,
    fallback: fieldNameSchema.or(z.literal('')).optional(),
  }),
});

const hardBreakSchema = z.object({ type: z.literal('hardBreak') });

export const inlineNodeSchema = z.discriminatedUnion('type', [
  textNodeSchema,
  fieldNodeSchema,
  hardBreakSchema,
]);

const inlineContent = z.array(inlineNodeSchema).max(2_000).optional();

/** Text alignment. TipTap writes `null` for the default (left). */
const alignSchema = z.enum(['left', 'center', 'right']).nullable().optional();

const paragraphSchema = z.object({
  type: z.literal('paragraph'),
  attrs: z.object({ textAlign: alignSchema }).optional(),
  content: inlineContent,
});

const headingSchema = z.object({
  type: z.literal('heading'),
  attrs: z.object({
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    textAlign: alignSchema,
  }),
  content: inlineContent,
});

export type ParagraphNode = z.infer<typeof paragraphSchema>;

export interface ListItemNode {
  type: 'listItem';
  content: (ParagraphNode | ListNode)[];
}
export interface BulletListNode {
  type: 'bulletList';
  content: ListItemNode[];
}
export interface OrderedListNode {
  type: 'orderedList';
  attrs?: { start?: number | undefined } | undefined;
  content: ListItemNode[];
}
export type ListNode = BulletListNode | OrderedListNode;

/** Lists may nest (Tab in the editor), up to a sensible depth. */
const MAX_LIST_DEPTH = 4;

function listSchema(depth: number): z.ZodType<ListNode> {
  const nested: z.ZodType<ListNode> =
    depth < MAX_LIST_DEPTH ? z.lazy(() => listSchema(depth + 1)) : z.never();
  const listItemSchema = z.object({
    type: z.literal('listItem'),
    content: z
      .array(z.union([paragraphSchema, nested]))
      .min(1)
      .max(20),
  });
  const items = z.array(listItemSchema).min(1).max(200);
  return z.discriminatedUnion('type', [
    z.object({ type: z.literal('bulletList'), content: items }),
    z.object({
      type: z.literal('orderedList'),
      attrs: z.object({ start: z.number().int().min(0).max(10_000).optional() }).optional(),
      content: items,
    }),
  ]);
}

const buttonSchema = z.object({
  type: z.literal('button'),
  attrs: z.object({ label: z.string().trim().min(1).max(80), href: z.string().max(2048) }),
});

/** A thin line between parts of the email. */
const dividerSchema = z.object({ type: z.literal('horizontalRule') });

/** Ids of stored pictures (UUIDs from the main process). */
export const assetIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9-]+$/, 'Not a picture id');

/** The widest picture the email's content column can show. */
export const MAX_IMAGE_WIDTH = 600;

/**
 * A picture stored in Postloom and sent inside each email (never linked from
 * the web). Alt text describes it for people who can't see pictures.
 */
const imageSchema = z.object({
  type: z.literal('image'),
  attrs: z.object({
    assetId: assetIdSchema,
    alt: z.string().max(200),
    width: z.number().int().min(16).max(MAX_IMAGE_WIDTH),
    align: z.enum(['left', 'center', 'right']).nullable().optional(),
    href: z.string().max(2048).nullable().optional(),
  }),
});

/** Blank space between parts of the email (Design mode). */
const spacerSchema = z.object({
  type: z.literal('spacer'),
  attrs: z.object({ height: z.number().int().min(8).max(80) }),
});

/** Small, quiet text at the bottom (address, "why you got this email"). */
const footerSchema = z.object({ type: z.literal('footer'), content: inlineContent });

/** Blocks that can go anywhere: in the letter, a column, or a "show only if" part. */
const simpleBlockSchema = z.union([
  paragraphSchema,
  headingSchema,
  listSchema(1),
  buttonSchema,
  dividerSchema,
  imageSchema,
  spacerSchema,
]);

/** A colour as #RRGGBB: the only form that can't break out of an email's style. */
const hexColourSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const cellAttrsSchema = z
  .object({
    colspan: z.number().int().min(1).max(8).optional(),
    rowspan: z.number().int().min(1).max(50).optional(),
    /** Column widths in editor pixels, one per column the cell spans (dragged in the editor). */
    colwidth: z.array(z.number().int().min(20).max(2000)).min(1).max(8).optional(),
    /** Where the words sit in a tall cell. */
    valign: z.enum(['top', 'middle', 'bottom']).optional(),
    /** Cell background colour. */
    background: hexColourSchema.optional(),
  })
  .optional();

const cellSchema = z.object({
  type: z.enum(['tableCell', 'tableHeader']),
  attrs: cellAttrsSchema,
  content: z.array(paragraphSchema).min(1).max(5),
});

/** How a table's lines are drawn: none, between rows (the default), or around every cell. */
export const tableBordersSchema = z.enum(['none', 'rows', 'grid']);
/** Room inside each cell. */
export const tableSpacingSchema = z.enum(['compact', 'normal', 'roomy']);

/**
 * A table (Design mode): rows of text, an optional header row, and how it
 * looks. Every look setting is optional; left out, it looks as it always has.
 */
const tableSchema = z.object({
  type: z.literal('table'),
  attrs: z
    .object({
      striped: z.boolean().optional(),
      borders: tableBordersSchema.optional(),
      borderColor: hexColourSchema.optional(),
      /** Header row background; its text turns white on dark colours. */
      headerColor: hexColourSchema.optional(),
      spacing: tableSpacingSchema.optional(),
      /** True: only as wide as its contents. Otherwise it fills the width. */
      fit: z.boolean().optional(),
    })
    .optional(),
  content: z
    .array(z.object({ type: z.literal('tableRow'), content: z.array(cellSchema).min(1).max(8) }))
    .min(1)
    .max(100),
});

/** Side-by-side columns (Design mode). On phones they stack. */
const columnsSchema = z.object({
  type: z.literal('columns'),
  content: z
    .array(
      z.object({ type: z.literal('column'), content: z.array(simpleBlockSchema).min(1).max(100) }),
    )
    .min(2)
    .max(4),
});

/** How a "show only if" part decides. */
export const conditionOpSchema = z.enum(['notEmpty', 'isEmpty', 'equals', 'notEquals']);

/**
 * A part of the email shown only to some people (Design mode), e.g. "only if
 * Discount is not empty". The field and value use the same safe characters
 * as detail names, so they can never break out of the Liquid condition.
 */
const conditionalSchema = z.object({
  type: z.literal('conditional'),
  attrs: z
    .object({
      field: fieldNameSchema,
      op: conditionOpSchema,
      value: fieldNameSchema.or(z.literal('')).optional(),
    })
    .refine(
      (attrs) => !(attrs.op === 'equals' || attrs.op === 'notEquals') || Boolean(attrs.value),
      'This rule needs a value to compare with',
    ),
  content: z
    .array(z.union([simpleBlockSchema, tableSchema]))
    .min(1)
    .max(200),
});

export const blockNodeSchema = z.union([
  simpleBlockSchema,
  columnsSchema,
  tableSchema,
  conditionalSchema,
  footerSchema,
]);

/**
 * How the email sits in the reader's window:
 * - `letter`: fills the window, like an email typed in Gmail or Outlook;
 * - `card`: a centred column on a coloured background, like a newsletter.
 */
export const documentLayoutSchema = z.enum(['letter', 'card']);

export const textSizeSchema = z.enum(['small', 'normal', 'large']);

/**
 * A template's own look. Anything left out comes from the sender's brand
 * look, then Postloom's default.
 */
export const templateLookSchema = z.object({
  layout: documentLayoutSchema.optional(),
  fontFamily: z.enum(EMAIL_FONT_STACKS).optional(),
  textSize: textSizeSchema.optional(),
  /** Button and accent colour, as #RRGGBB. */
  primaryColor: hexColourSchema.optional(),
  /** Colour around a centred card, as #RRGGBB. */
  backgroundColor: hexColourSchema.optional(),
  /** False hides the sender's logo in this template. */
  showLogo: z.boolean().optional(),
});

export const writeDocumentSchema = z.object({
  type: z.literal('doc'),
  attrs: templateLookSchema.optional(),
  content: z.array(blockNodeSchema).max(500),
});

export type Mark = z.infer<typeof markSchema>;
export type InlineNode = z.infer<typeof inlineNodeSchema>;
export type BlockNode = z.infer<typeof blockNodeSchema>;
export type SimpleBlockNode = z.infer<typeof simpleBlockSchema>;
export type TableNode = z.infer<typeof tableSchema>;
export type TableBorders = z.infer<typeof tableBordersSchema>;
export type TableSpacing = z.infer<typeof tableSpacingSchema>;
export type ColumnsNode = z.infer<typeof columnsSchema>;
export type ConditionalNode = z.infer<typeof conditionalSchema>;
export type ConditionOp = z.infer<typeof conditionOpSchema>;
export type WriteDocument = z.infer<typeof writeDocumentSchema>;
export type DocumentLayout = z.infer<typeof documentLayoutSchema>;
export type TextSize = z.infer<typeof textSizeSchema>;
export type TemplateLook = z.infer<typeof templateLookSchema>;

/** The document's layout; a letter unless it asks for a card. */
export function documentLayout(doc: WriteDocument): DocumentLayout {
  return doc.attrs?.layout ?? 'letter';
}
export type ImageNode = z.infer<typeof imageSchema>;

/** Any block, wherever it sits (inside lists, columns, tables or "show only if" parts). */
export type AnyBlock =
  | BlockNode
  | ParagraphNode
  | ListNode
  | ColumnsNode['content'][number]
  | TableNode['content'][number]
  | TableNode['content'][number]['content'][number];

/** Visits every block in the document, depth first, in reading order. */
export function walkBlocks(doc: WriteDocument, visit: (block: AnyBlock) => void): void {
  const walk = (block: AnyBlock) => {
    visit(block);
    switch (block.type) {
      case 'bulletList':
      case 'orderedList':
        for (const item of block.content) item.content.forEach(walk);
        break;
      case 'columns':
      case 'column':
      case 'table':
      case 'tableRow':
      case 'tableCell':
      case 'tableHeader':
      case 'conditional':
        (block.content as AnyBlock[]).forEach(walk);
        break;
      default:
        break;
    }
  };
  doc.content.forEach(walk);
}

/** Every inline node (text, details, line breaks), in reading order. */
export function walkInline(doc: WriteDocument, visit: (node: InlineNode) => void): void {
  walkBlocks(doc, (block) => {
    if (block.type === 'paragraph' || block.type === 'heading' || block.type === 'footer') {
      (block.content ?? []).forEach(visit);
    }
  });
}

/** Blocks only Design mode can show. A template using them can't switch back to Write mode. */
export const DESIGN_ONLY_BLOCKS = ['columns', 'table', 'conditional', 'spacer', 'footer'] as const;

export function usesDesignBlocks(doc: WriteDocument): boolean {
  let found = false;
  walkBlocks(doc, (block) => {
    if ((DESIGN_ONLY_BLOCKS as readonly string[]).includes(block.type)) found = true;
  });
  return found;
}

/** Every stored picture the document shows, in order of first use. */
export function collectAssetIds(doc: WriteDocument): string[] {
  const ids = new Set<string>();
  walkBlocks(doc, (block) => {
    if (block.type === 'image') ids.add(block.attrs.assetId);
  });
  return [...ids];
}

/** Every spreadsheet column the document uses, in order of first use. */
export function collectFields(doc: WriteDocument): string[] {
  const names = new Set<string>();
  walkBlocks(doc, (block) => {
    if (block.type === 'conditional') names.add(block.attrs.field);
    if (block.type === 'paragraph' || block.type === 'heading' || block.type === 'footer') {
      for (const node of block.content ?? []) {
        if (node.type === 'field') names.add(node.attrs.name);
      }
    }
  });
  return [...names];
}

/**
 * Turns the editor's JSON into a stored `WriteDocument`. ProseMirror writes
 * every attribute, including defaults (a null alignment, an empty fallback,
 * link target/rel); those are dropped so stored documents stay small and
 * stable. Throws if the result isn't a valid document.
 */
export function fromEditorJson(json: unknown): WriteDocument {
  return writeDocumentSchema.parse(dropDefaults(json));
}

function dropDefaults(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropDefaults);
  if (!value || typeof value !== 'object') return value;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key, v]) => v !== null && !((key === 'fallback' || key === 'value') && v === ''))
    .map(([key, v]) => [key, dropDefaults(v)] as const)
    .filter(
      ([key, v]) => !(key === 'attrs' && v && typeof v === 'object' && Object.keys(v).length === 0),
    );
  return Object.fromEntries(entries);
}
