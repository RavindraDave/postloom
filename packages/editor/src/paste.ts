import type { TableNode } from './document';

/** The most a pasted table can have (the same limits as any table). */
export const MAX_PASTED_ROWS = 100;
export const MAX_PASTED_COLUMNS = 8;

/**
 * Turns tab-separated text (what spreadsheets put on the clipboard as plain
 * text) into a table, with the first row as its header. Returns null when the
 * text isn't a grid (no tabs), or is too big, so it pastes as ordinary text.
 */
export function tableFromTabbedText(text: string): TableNode | null {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
  if (lines.length === 0 || !lines.some((line) => line.includes('\t'))) return null;
  const rows = lines.map((line) => line.split('\t').map((cell) => cell.trim()));
  const width = Math.max(...rows.map((row) => row.length));
  if (width < 2 || width > MAX_PASTED_COLUMNS || rows.length > MAX_PASTED_ROWS) return null;

  return {
    type: 'table',
    content: rows.map((row, index) => ({
      type: 'tableRow',
      content: Array.from({ length: width }, (_, column) => {
        const value = row[column] ?? '';
        return {
          type: index === 0 ? 'tableHeader' : 'tableCell',
          content: [
            value === ''
              ? { type: 'paragraph' }
              : { type: 'paragraph', content: [{ type: 'text', text: value }] },
          ],
        };
      }),
    })),
  };
}
