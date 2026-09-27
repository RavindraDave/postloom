import { generateJSON } from '@tiptap/core';
import { fieldNameSchema, fromEditorJson, usesDesignBlocks, type WriteDocument } from './document';
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
  /** Placeholders like {{First Name}}, [First Name] or «First Name» that became details. */
  details: string[];
}

export interface ImportOptions {
  /**
   * Pictures the app stored from the file (as `<img data-asset>`). Only these
   * are kept; any other picture (on the web, or a made-up id) is left out.
   */
  assetIds?: readonly string[];
  /** Word documents: every table holds data, since Word has no layout tables. */
  kind?: 'html' | 'docx';
}

/** Tables with more columns than this are too wide for an email and become text. */
const MAX_TABLE_COLUMNS = 8;

/**
 * Turns an HTML email into a Postloom document (runs where a DOM exists: the
 * renderer). Nothing from the file runs: it is parsed into an inert document,
 * and only what Postloom understands is kept (text, headings, lists, links,
 * tables). Scripts, styles, forms and web pictures are left out.
 */
export function importHtml(html: string, options: ImportOptions = {}): ImportedHtml {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const title = parsed.title.trim() || null;
  const body = parsed.body;

  body
    .querySelectorAll('script, style, noscript, template, iframe, object, embed, form, head')
    .forEach((element) => {
      element.remove();
    });
  const stored = new Set(options.assetIds ?? []);
  let picturesLeftOut = 0;
  body.querySelectorAll('img').forEach((element) => {
    const assetId = element.getAttribute('data-asset') ?? '';
    if (!stored.has(assetId)) {
      picturesLeftOut += 1;
      element.remove();
      return;
    }
    // Keep only what a picture needs; nothing else from the file.
    const picture = parsed.createElement('img');
    picture.setAttribute('data-asset', assetId);
    picture.setAttribute('width', element.getAttribute('width') ?? '300');
    picture.setAttribute('alt', (element.getAttribute('alt') ?? '').slice(0, 200));
    element.replaceWith(picture);
  });
  unwrapLayoutTables(body, options.kind === 'docx');
  const details = placeholdersToDetails(body);

  try {
    const document = fromEditorJson(generateJSON(body.innerHTML, writeModeExtensions));
    return {
      document,
      title,
      picturesLeftOut,
      needsDesign: usesDesignBlocks(document),
      textOnly: false,
      details,
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
    return { document, title, picturesLeftOut, needsDesign: false, textOnly: true, details: [] };
  }
}

/**
 * Email HTML often uses tables only to lay things out. Those are replaced by
 * their contents; tables that really hold data (two or more columns of plain
 * text, no tables inside) are kept.
 */
function unwrapLayoutTables(root: HTMLElement, allDataTables = false): void {
  const tables = [...root.querySelectorAll('table')].reverse(); // innermost first
  for (const table of tables) {
    if (allDataTables ? fitsAsTable(table) : isDataTable(table)) continue;
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

/** A table of rows and columns that fits in an email (Word tables). */
function fitsAsTable(table: HTMLTableElement): boolean {
  if (table.querySelector('table')) return false;
  const rows = [...table.rows];
  if (rows.length === 0 || rows.length > 100) return false;
  const widest = Math.max(...rows.map((row) => row.cells.length));
  return widest >= 1 && widest <= MAX_TABLE_COLUMNS;
}

function isDataTable(table: HTMLTableElement): boolean {
  if (table.querySelector('table')) return false;
  const rows = [...table.rows];
  if (rows.length === 0) return false;
  const widest = Math.max(...rows.map((row) => row.cells.length));
  if (widest < 2 || widest > MAX_TABLE_COLUMNS) return false;
  const blockInside = table.querySelector('div, p, h1, h2, h3, ul, ol, img');
  return !blockInside || table.getAttribute('role') === 'table';
}

/**
 * {{First Name}}, «First Name» (Word mail merge) and [First Name] become
 * personal details. Square brackets only count for short names that look
 * like a column name, so "[optional]"-style notes stay text.
 */
const PLACEHOLDER =
  /\{\{\s*([^{}]{1,64}?)\s*\}\}|«\s*([^«»]{1,64}?)\s*»|\[\s*([^[\]]{1,40}?)\s*\]/g;

function placeholdersToDetails(root: HTMLElement): string[] {
  const found = new Set<string>();
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node as Text);

  for (const text of texts) {
    const value = text.data;
    const matches = [...value.matchAll(PLACEHOLDER)];
    if (matches.length === 0) continue;
    const fragment = root.ownerDocument.createDocumentFragment();
    let last = 0;
    for (const match of matches) {
      const bracketed = match[3] !== undefined;
      const name = (match[1] ?? match[2] ?? match[3] ?? '').trim();
      const looksLikeColumn =
        fieldNameSchema.safeParse(name).success &&
        // A column name, not template code like {{ row.secret }} or {{ name | upcase }}.
        /^[A-Za-z][A-Za-z0-9 _&'/-]*$/.test(name) &&
        (!bracketed || name.split(/\s+/).length <= 4);
      if (!looksLikeColumn) continue;
      fragment.append(value.slice(last, match.index));
      const field = root.ownerDocument.createElement('span');
      field.setAttribute('data-field', name);
      field.setAttribute('data-fallback', '');
      fragment.append(field);
      found.add(name);
      last = match.index + match[0].length;
    }
    if (last === 0) continue;
    fragment.append(value.slice(last));
    text.replaceWith(fragment);
  }
  return [...found];
}
