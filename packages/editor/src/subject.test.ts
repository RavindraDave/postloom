import { getSchema } from '@tiptap/core';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { describe, expect, it } from 'vitest';
import { formatSubject, parseSubject, renderSubject, subjectFields } from './subject';
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
