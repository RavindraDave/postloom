import { getSchema } from '@tiptap/core';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { describe, expect, it } from 'vitest';
import { writeDocumentSchema } from './document';
import { paymentReminder } from './fixtures';
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

    const roundTripped = normalise(node.toJSON());
    expect(writeDocumentSchema.parse(roundTripped)).toEqual(paymentReminder);
  });

  it('leaves out formatting that email clients render badly', () => {
    expect(schema.nodes['codeBlock']).toBeUndefined();
    expect(schema.nodes['blockquote']).toBeUndefined();
    expect(schema.marks['strike']).toBeUndefined();
  });
});

/**
 * ProseMirror writes every attribute, including defaults (e.g. an empty
 * fallback); the stored document omits empty ones.
 */
function normalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalise);
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key, v]) => !(key === 'fallback' && v === ''))
      .map(([key, v]) => [key, normalise(v)]);
    return Object.fromEntries(entries);
  }
  return value;
}
