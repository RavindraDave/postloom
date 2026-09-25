/** A sheet split into its header row and the rows of people under it. */
export interface RecipientTable {
  headers: string[];
  rows: { rowNo: number; cells: string[] }[];
}

/**
 * Finds the header row: the first row (within the first 10) that has at
 * least two filled cells, mostly text rather than numbers or addresses.
 * Empty and repeated header names get readable names ("Column C", "Name (2)"),
 * and completely empty rows are left out. Row numbers are the ones people
 * see in Excel (1-based).
 */
export function toRecipientTable(rows: string[][]): RecipientTable {
  const headerIndex = findHeaderRow(rows);
  const width = Math.max(0, ...rows.map((row) => row.length));
  const seen = new Map<string, number>();
  const headers = Array.from({ length: width }, (_, column) => {
    const raw = (rows[headerIndex]?.[column] ?? '').replace(/\s+/g, ' ').trim();
    const base = raw || `Column ${columnLetter(column)}`;
    const count = (seen.get(base.toLowerCase()) ?? 0) + 1;
    seen.set(base.toLowerCase(), count);
    return count === 1 ? base : `${base} (${String(count)})`;
  });
  const body = rows
    .slice(headerIndex + 1)
    .map((cells, index) => ({ rowNo: headerIndex + index + 2, cells }))
    .filter((row) => row.cells.some((cell) => cell !== ''));
  return { headers, rows: body };
}

function findHeaderRow(rows: string[][]): number {
  const candidates = rows.slice(0, 10);
  const filledIn = (row: string[] | undefined) => (row ?? []).filter((cell) => cell !== '');
  // Single-column lists have one-cell headers; otherwise a title row is skipped.
  const needed = Math.min(2, Math.max(0, ...candidates.map((row) => filledIn(row).length)));
  for (let index = 0; index < candidates.length; index += 1) {
    const filled = filledIn(candidates[index]);
    if (filled.length === 0 || filled.length < needed) continue;
    const texty = filled.filter((cell) => !/^[\d.,\s-]+$/.test(cell) && !cell.includes('@'));
    if (texty.length >= Math.ceil(filled.length / 2)) return index;
  }
  return 0;
}

/** A, B, …, Z, AA, AB … */
export function columnLetter(index: number): string {
  let letters = '';
  let n = index + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}
