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

const paragraphSchema = z.object({ type: z.literal('paragraph'), content: inlineContent });

const headingSchema = z.object({
  type: z.literal('heading'),
  attrs: z.object({ level: z.union([z.literal(1), z.literal(2), z.literal(3)]) }),
  content: inlineContent,
});

const bulletListSchema = z.object({
  type: z.literal('bulletList'),
  content: z
    .array(
      z.object({ type: z.literal('listItem'), content: z.array(paragraphSchema).min(1).max(20) }),
    )
    .min(1)
    .max(200),
});

const buttonSchema = z.object({
  type: z.literal('button'),
  attrs: z.object({ label: z.string().trim().min(1).max(80), href: z.string().max(2048) }),
});

export const blockNodeSchema = z.discriminatedUnion('type', [
  paragraphSchema,
  headingSchema,
  bulletListSchema,
  buttonSchema,
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
  for (const block of doc.content) {
    if (block.type === 'bulletList') {
      for (const item of block.content) {
        for (const paragraph of item.content) visitInline(paragraph.content);
      }
    } else if (block.type !== 'button') {
      visitInline(block.content);
    }
  }
  return [...names];
}
