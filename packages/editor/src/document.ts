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

export const blockNodeSchema = z.union([
  paragraphSchema,
  headingSchema,
  listSchema(1),
  buttonSchema,
  dividerSchema,
]);

export const writeDocumentSchema = z.object({
  type: z.literal('doc'),
  content: z.array(blockNodeSchema).max(500),
});

export type Mark = z.infer<typeof markSchema>;
export type InlineNode = z.infer<typeof inlineNodeSchema>;
export type BlockNode = z.infer<typeof blockNodeSchema>;
export type WriteDocument = z.infer<typeof writeDocumentSchema>;

/** Every spreadsheet column the document uses, in order of first use. */
export function collectFields(doc: WriteDocument): string[] {
  const names = new Set<string>();
  const visitInline = (nodes: InlineNode[] | undefined) => {
    for (const node of nodes ?? []) {
      if (node.type === 'field') names.add(node.attrs.name);
    }
  };
  const visitBlock = (block: BlockNode | ListItemNode['content'][number]) => {
    switch (block.type) {
      case 'bulletList':
      case 'orderedList':
        for (const item of block.content) item.content.forEach(visitBlock);
        break;
      case 'paragraph':
      case 'heading':
        visitInline(block.content);
        break;
      default:
        break;
    }
  };
  doc.content.forEach(visitBlock);
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
    .filter(([key, v]) => v !== null && !(key === 'fallback' && v === ''))
    .map(([key, v]) => [key, dropDefaults(v)] as const)
    .filter(
      ([key, v]) => !(key === 'attrs' && v && typeof v === 'object' && Object.keys(v).length === 0),
    );
  return Object.fromEntries(entries);
}
