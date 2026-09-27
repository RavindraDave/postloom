import { getSchema } from '@tiptap/core';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { describe, expect, it } from 'vitest';
import {
  formatSubject,
  parseSubject,
  renderSubject,
  subjectFields,
  templateFields,
} from './subject';
import { subjectExtensions, subjectFromEditorJson, subjectToEditorContent } from './tiptap';

describe('subject line with personal details', () => {
  const subject = 'Invoice {{Invoice No}} for {{First Name}}';

  it('splits the stored subject into text and details', () => {
    expect(parseSubject(subject)).toEqual([
      { type: 'text', text: 'Invoice ' },
      { type: 'field', name: 'Invoice No' },
      { type: 'text', text: ' for ' },
      { type: 'field', name: 'First Name' },
    ]);
    expect(subjectFields(subject)).toEqual(['Invoice No', 'First Name']);
  });

  it('shows placeholders in tests and fills values when sending', () => {
    expect(renderSubject(subject)).toBe('Invoice [Invoice No] for [First Name]');
    expect(renderSubject(subject, { 'Invoice No': 'INV-7', 'First Name': 'Rahul' })).toBe(
      'Invoice INV-7 for Rahul',
    );
    expect(renderSubject(subject, {})).toBe('Invoice  for');
  });

  it('never lets a value add a line break to the email header', () => {
    expect(renderSubject('Hi {{Name}}', { Name: 'Rahul\r\nBcc: evil@example.com' })).toBe(
      'Hi Rahul Bcc: evil@example.com',
    );
  });

  it('keeps typed braces as text, never as a detail', () => {
    const stored = formatSubject([{ type: 'text', text: 'Hi {{Name}} \n there' }]);
    expect(stored).toBe('Hi { {Name} }   there');
    expect(subjectFields(stored)).toEqual([]);
  });

  it('ignores markers that are not valid detail names', () => {
    expect(subjectFields('{{Name"}} and {{ Real }}')).toEqual(['Real']);
  });

  it('round-trips through the one-line subject editor', () => {
    const schema = getSchema(subjectExtensions);
    const node = ProseMirrorNode.fromJSON(schema, subjectToEditorContent(subject));
    node.check();
    expect(subjectFromEditorJson(node.toJSON() as never)).toBe(subject);
    expect(subjectFromEditorJson(subjectToEditorContent(''))).toBe('');
  });
});

describe('the details a template needs', () => {
  it('lists subject and letter details, and which may be empty', () => {
    const doc = {
      type: 'doc' as const,
      content: [
        {
          type: 'paragraph' as const,
          content: [
            { type: 'field' as const, attrs: { name: 'First Name', fallback: 'there' } },
            { type: 'field' as const, attrs: { name: 'Amount' } },
          ],
        },
        {
          type: 'conditional' as const,
          attrs: { field: 'Discount', op: 'notEmpty' as const },
          content: [{ type: 'paragraph' as const }],
        },
      ],
    };
    expect(templateFields('Invoice {{Invoice No}}', doc)).toEqual([
      { name: 'Invoice No', hasFallback: false },
      { name: 'Discount', hasFallback: true },
      { name: 'First Name', hasFallback: true },
      { name: 'Amount', hasFallback: false },
    ]);
  });

  it('counts details in the preview text, which may be empty', () => {
    const doc = {
      type: 'doc' as const,
      attrs: { previewText: 'For {{Company}}' },
      content: [],
    };
    expect(templateFields('Hello', doc)).toEqual([{ name: 'Company', hasFallback: true }]);
  });
});
