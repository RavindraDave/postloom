import { describe, expect, it } from 'vitest';
import { writeDocumentSchema } from './document';
import { tableFromTabbedText } from './paste';

describe('tableFromTabbedText', () => {
  it('turns copied spreadsheet cells into a table with a header row', () => {
    const table = tableFromTabbedText('Item\tAmount\r\nDesign\t₹12,400\r\nPrinting\t₹950\r\n');
    expect(table?.content).toHaveLength(3);
    expect(table?.content[0]?.content[0]?.type).toBe('tableHeader');
    expect(table?.content[1]?.content[1]?.content[0]?.content).toEqual([
      { type: 'text', text: '₹12,400' },
    ]);
    expect(writeDocumentSchema.safeParse({ type: 'doc', content: [table] }).success).toBe(true);
  });

  it('fills short rows so every row has the same cells', () => {
    const table = tableFromTabbedText('A\tB\tC\nonly one');
    expect(table?.content[1]?.content).toHaveLength(3);
    expect(writeDocumentSchema.safeParse({ type: 'doc', content: [table] }).success).toBe(true);
  });

  it('leaves ordinary text alone', () => {
    expect(tableFromTabbedText('Dear Rahul,\nThank you.')).toBeNull();
    expect(tableFromTabbedText('one\tcell only')).not.toBeNull();
    expect(tableFromTabbedText('single')).toBeNull();
  });

  it('pastes grids too big for an email as text', () => {
    expect(tableFromTabbedText(Array(9).fill('x').join('\t'))).toBeNull();
    expect(tableFromTabbedText(Array(101).fill('a\tb').join('\n'))).toBeNull();
  });
});
