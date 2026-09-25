import { generateJSON } from '@tiptap/core';
import { fromEditorJson, usesDesignBlocks, type WriteDocument } from './document';
import { writeModeExtensions } from './tiptap';

export interface ImportedHtml {
  document: WriteDocument;
  /** The HTML's <title>, if it had one. */
  title: string | null;
  /** Pictures that couldn't come along (they must be added again with "Picture"). */
  picturesLeftOut: number;
  /** Whether the result needs Design mode (tables, columns…). */
  needsDesign: boolean;
  /** True when the layout couldn't be kept and only the words were imported. */
  textOnly: boolean;
}

/**
 * Turns an HTML email into a Postloom document (runs where a DOM exists: the
 * renderer). Nothing from the file runs: it is parsed into an inert document,
 * and only what Postloom understands is kept (text, headings, lists, links,
 * tables). Scripts, styles, forms and web pictures are left out.
 */
export function importHtml(html: string): ImportedHtml {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const title = parsed.title.trim() || null;
  const body = parsed.body;

  body
    .querySelectorAll('script, style, noscript, template, iframe, object, embed, form, head')
    .forEach((element) => {
      element.remove();
    });
  const picturesLeftOut = body.querySelectorAll('img').length;
  body.querySelectorAll('img').forEach((element) => {
    element.remove();
  });
  unwrapLayoutTables(body);

  try {
    const document = fromEditorJson(generateJSON(body.innerHTML, writeModeExtensions));
    return {
      document,
      title,
      picturesLeftOut,
      needsDesign: usesDesignBlocks(document),
      textOnly: false,
    };
  } catch {
    // The layout didn't fit: keep the words, one paragraph per block of text.
    const paragraphs = body.textContent
      .split(/\n\s*\n/)
      .map((text) => text.replace(/\s+/g, ' ').trim().slice(0, 10_000))
      .filter(Boolean)
      .slice(0, 400);
    const document = fromEditorJson({
      type: 'doc',
      content: paragraphs.length
        ? paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] }))
        : [{ type: 'paragraph' }],
    });
    return { document, title, picturesLeftOut, needsDesign: false, textOnly: true };
  }
}

/**
 * Email HTML often uses tables only to lay things out. Those are replaced by
 * their contents; tables that really hold data (two or more columns of plain
 * text, no tables inside) are kept.
 */
function unwrapLayoutTables(root: HTMLElement): void {
  const tables = [...root.querySelectorAll('table')].reverse(); // innermost first
  for (const table of tables) {
    if (isDataTable(table)) continue;
    const fragment = table.ownerDocument.createDocumentFragment();
    table
      .querySelectorAll(
        ':scope > * > tr > td, :scope > * > tr > th, :scope > tr > td, :scope > tr > th',
      )
      .forEach((cell) => {
        const block = table.ownerDocument.createElement('div');
        block.append(...cell.childNodes);
        fragment.append(block);
      });
    table.replaceWith(fragment);
  }
}

function isDataTable(table: HTMLTableElement): boolean {
  if (table.querySelector('table')) return false;
  const rows = [...table.rows];
  if (rows.length === 0) return false;
  const widest = Math.max(...rows.map((row) => row.cells.length));
  if (widest < 2) return false;
  const blockInside = table.querySelector('div, p, h1, h2, h3, ul, ol, img');
  return !blockInside || table.getAttribute('role') === 'table';
}
