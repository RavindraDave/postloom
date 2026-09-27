import { collectAssetIds, documentLayout, type TemplateLook, type TextSize } from './document';
import { formatValues } from './formats';
import { parseSubject } from './subject';
import type {
  BlockNode,
  ColumnsNode,
  ConditionOp,
  InlineNode,
  ListNode,
  Mark,
  TableNode,
  WriteDocument,
} from './document';

export interface BrandLook {
  /** Button and accent colour, as #RRGGBB. */
  primaryColor: string;
  /** CSS font stack used in the email. Web-safe fonts render most reliably. */
  fontFamily: string;
  /** Colour of the area around the email, as #RRGGBB. */
  backgroundColor: string;
  /** Shown at the top of every email from this sender. */
  logo?: { assetId: string; width: number; alt: string } | null | undefined;
  /** Plain text added at the end of every email from this sender. */
  signature?: string | null | undefined;
}

/** A sender's saved brand look (see the contracts' `brandSchema`). */
export interface SavedBrand {
  primaryColor: string;
  fontFamily: string;
  logo: { assetId: string; width: number } | null;
}

/** How emails from a sender look; the plain look when it has no brand. */
export function lookFromBrand(
  brand: SavedBrand | null | undefined,
  logoAlt: string,
  signature?: string | null,
): BrandLook {
  if (!brand) return signature ? { ...DEFAULT_BRAND, signature } : DEFAULT_BRAND;
  return {
    ...DEFAULT_BRAND,
    signature: signature ?? null,
    primaryColor: brand.primaryColor,
    fontFamily: brand.fontFamily,
    logo: brand.logo
      ? { assetId: brand.logo.assetId, width: brand.logo.width, alt: logoAlt }
      : null,
  };
}

/** Widest a logo is shown at the top of the email. */
export const MAX_LOGO_WIDTH = 200;

/**
 * Where a stored picture comes from: `cid:` for sending (the picture travels
 * inside the email), or an app URL for previews.
 */
export type ImageSource = (assetId: string) => string;

/** The Content-ID a stored picture has inside a sent email. */
export function imageContentId(assetId: string): string {
  return `${assetId}@postloom`;
}

export const inlineImageSource: ImageSource = (assetId) => `cid:${imageContentId(assetId)}`;

export { EMAIL_FONTS } from './fonts';

export const DEFAULT_BRAND: BrandLook = {
  primaryColor: '#2F5D8C',
  fontFamily: 'Arial, Helvetica, sans-serif',
  backgroundColor: '#F4F5F7',
};

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;
const SAFE_FONT_STACK = /^[\w\s,'-]{1,200}$/;
const HEADING_SIZES = { 1: '28px', 2: '22px', 3: '18px' } as const;

/**
 * How personal details are written:
 * - `liquid`: for sending; filled in per recipient after compiling, and
 *   "show only if" parts become Liquid conditions;
 * - `placeholder`: for previews and tests ("[First Name]", every part shown);
 * - `{ values }`: a preview with example values ("Rahul"), with "show only
 *   if" parts decided on those values.
 */
export type FieldMode = 'liquid' | 'placeholder' | { values: Record<string, string> };

/**
 * Converts a Write- or Design-mode document to MJML.
 *
 * A `letter` (the default) is plain HTML that fills the reader's window, like
 * an email typed in Gmail or Outlook: no box, no coloured surround. A `card`
 * is a centred column on the brand's background, like a newsletter: it
 * becomes a run of white sections: plain blocks share one
 * section, and each set of columns gets its own, so the email reads as one
 * page. Everything the user typed is HTML-escaped, and `{` is encoded so
 * typed text can never become a Liquid tag. Only http(s) and mailto links
 * survive.
 */
export function writeDocumentToMjml(
  own: WriteDocument,
  brand: BrandLook = DEFAULT_BRAND,
  fieldMode: FieldMode = 'liquid',
  imageSrc: ImageSource = inlineImageSource,
): string {
  const look = sanitiseBrand(withTemplateLook(brand, own.attrs));
  const doc: WriteDocument = { ...own, content: withSignature(own.content, look.signature) };
  const textSize = TEXT_SIZES[doc.attrs?.textSize ?? 'normal'];
  // Example or test values are shown in the template's formats; "show only if"
  // parts decide on the values as they are in the list.
  const conditionValues = typeof fieldMode === 'object' ? fieldMode.values : undefined;
  const shown: FieldMode =
    typeof fieldMode === 'object'
      ? { values: formatValues(fieldMode.values, doc.attrs?.detailFormats) }
      : fieldMode;
  const context: RenderContext = { look, fieldMode: shown, imageSrc, textSize, conditionValues };
  if (documentLayout(doc) === 'letter') return letterMjml(doc, context);
  const logo = look.logo
    ? `<mj-image src="${escapeAttribute(imageSrc(look.logo.assetId))}" alt="${escapeAttribute(look.logo.alt)}" width="${String(Math.min(look.logo.width, MAX_LOGO_WIDTH))}px" align="left" padding="0 0 20px" />`
    : '';

  // Group the blocks into sections: runs of plain blocks, and each set of columns.
  type Section = { kind: 'flow'; blocks: string[] } | { kind: 'columns'; node: ColumnsNode };
  const sections: Section[] = [];
  const flow = (): string[] => {
    const last = sections.at(-1);
    if (last?.kind === 'flow') return last.blocks;
    const blocks: string[] = [];
    sections.push({ kind: 'flow', blocks });
    return blocks;
  };
  if (logo) flow().push(logo);
  for (const block of doc.content) {
    if (block.type === 'columns') sections.push({ kind: 'columns', node: block });
    else flow().push(renderBlock(block, context));
  }
  if (sections.length === 0) flow();

  const body = sections.map((section, index) => {
    const top = index === 0 ? '32px' : '0';
    const bottom = index === sections.length - 1 ? '32px' : '0';
    const padding = `${top} 28px ${bottom}`;
    if (section.kind === 'flow') {
      return [
        `<mj-section background-color="#FFFFFF" padding="${padding}">`,
        '<mj-column>',
        ...section.blocks,
        '</mj-column>',
        '</mj-section>',
      ].join('\n');
    }
    const columns = section.node.content.map((column) =>
      [
        '<mj-column padding="0 8px">',
        ...column.content.map((block) => renderBlock(block, context)),
        '</mj-column>',
      ].join('\n'),
    );
    return [
      `<mj-section background-color="#FFFFFF" padding="${padding}">`,
      ...columns,
      '</mj-section>',
    ].join('\n');
  });

  return [
    '<mjml>',
    '<mj-head>',
    previewMjml(doc, context),
    '<mj-attributes>',
    `<mj-all font-family="${escapeAttribute(look.fontFamily)}" />`,
    `<mj-text font-size="${String(context.textSize)}px" line-height="1.6" color="#222222" padding="6px 0" />`,
    '</mj-attributes>',
    '</mj-head>',
    `<mj-body background-color="${look.backgroundColor}">`,
    ...body,
    '</mj-body>',
    '</mjml>',
  ].join('\n');
}

interface RenderContext {
  look: BrandLook;
  fieldMode: FieldMode;
  imageSrc: ImageSource;
  /** Body text size in px. */
  textSize: number;
  /** The unformatted example values that "show only if" parts decide on. */
  conditionValues?: Record<string, string> | undefined;
}

/** Every stored picture an email carries: the logo (unless hidden) and its pictures. */
export function emailAssetIds(doc: WriteDocument, brand: BrandLook): string[] {
  const logo = withTemplateLook(brand, doc.attrs).logo;
  return [...(logo ? [logo.assetId] : []), ...collectAssetIds(doc)];
}

/** Body text sizes a template can choose. */
export const TEXT_SIZES: Record<TextSize, number> = { small: 14, normal: 16, large: 18 };

/** The sender's look with the template's own choices on top. */
export function withTemplateLook(brand: BrandLook, own: TemplateLook | undefined): BrandLook {
  if (!own) return brand;
  return {
    ...brand,
    ...(own.fontFamily && { fontFamily: own.fontFamily }),
    ...(own.primaryColor && { primaryColor: own.primaryColor }),
    ...(own.backgroundColor && { backgroundColor: own.backgroundColor }),
    ...(own.showLogo === false && { logo: null }),
    ...(own.showSignature === false && { signature: null }),
  };
}

/**
 * The sender's signature as a paragraph, one line per line, placed after the
 * letter and before any footer.
 */
function withSignature(content: BlockNode[], signature: string | null | undefined): BlockNode[] {
  const lines = (signature ?? '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .slice(0, 8);
  if (!lines.some((line) => line.trim())) return content;
  const inline: InlineNode[] = lines.flatMap((line, index) => [
    ...(index > 0 ? [{ type: 'hardBreak' as const }] : []),
    ...(line ? [{ type: 'text' as const, text: line.slice(0, 200) }] : []),
  ]);
  let at = content.length;
  while (at > 0 && content[at - 1]?.type === 'footer') at -= 1;
  return [...content.slice(0, at), { type: 'paragraph', content: inline }, ...content.slice(at)];
}

type RenderableBlock = Exclude<BlockNode, ColumnsNode>;

function renderBlock(block: RenderableBlock, context: RenderContext): string {
  const { look, fieldMode, imageSrc } = context;
  switch (block.type) {
    case 'paragraph':
      return `<mj-text${alignAttribute(block.attrs?.textAlign)}><p style="margin:0">${renderInline(block.content, fieldMode)}</p></mj-text>`;
    case 'heading':
      return `<mj-text${alignAttribute(block.attrs.textAlign)} font-size="${HEADING_SIZES[block.attrs.level]}" font-weight="700" line-height="1.3">${renderInline(block.content, fieldMode)}</mj-text>`;
    case 'bulletList':
    case 'orderedList':
      return `<mj-text>${renderList(block, fieldMode)}</mj-text>`;
    case 'button': {
      const href = safeHref(block.attrs.href);
      const hrefAttribute = href ? ` href="${escapeAttribute(href)}"` : '';
      return `<mj-button${hrefAttribute} background-color="${look.primaryColor}" color="#FFFFFF" font-weight="700" border-radius="5px" align="left" padding="14px 0">${escapeText(block.attrs.label)}</mj-button>`;
    }
    case 'horizontalRule':
      return '<mj-divider border-color="#DDDDDD" border-width="1px" padding="14px 0" />';
    case 'image': {
      const { assetId, alt, width, align, href } = block.attrs;
      const link = href ? safeHref(href) : null;
      const hrefAttribute = link ? ` href="${escapeAttribute(link)}"` : '';
      return `<mj-image src="${escapeAttribute(imageSrc(assetId))}" alt="${escapeAttribute(alt)}" width="${String(width)}px" align="${align ?? 'center'}"${hrefAttribute} padding="10px 0" />`;
    }
    case 'spacer':
      return `<mj-spacer height="${String(block.attrs.height)}px" />`;
    case 'footer':
      return `<mj-text font-size="13px" line-height="1.5" color="#6B6B6B" align="center" padding="18px 0 0">${renderInline(block.content, fieldMode)}</mj-text>`;
    case 'table':
      return renderTable(block, fieldMode);
    case 'conditional': {
      const inner = block.content.map((child) => renderBlock(child, context)).join('\n');
      if (fieldMode === 'placeholder') return inner;
      if (fieldMode !== 'liquid') {
        return conditionHolds(block.attrs, context.conditionValues ?? fieldMode.values)
          ? inner
          : '';
      }
      return [
        `<mj-raw>${liquidCondition(block.attrs)}</mj-raw>`,
        inner,
        '<mj-raw>{% endif %}</mj-raw>',
      ].join('\n');
    }
  }
}

// ------------------------------------------------------------ Letter layout

const LETTER_HEADING_MARGIN = 'margin:18px 0 8px';

/**
 * A letter: the blocks as plain HTML inside one `mj-raw`, so MJML adds its
 * usual head (and the phone rules below) but no fixed-width column.
 */
/** The inbox preview line ("preheader"), with personal details filled in like the letter's. */
function previewMjml(doc: WriteDocument, context: RenderContext): string {
  const text = doc.attrs?.previewText?.trim();
  if (!text) return '';
  const { fieldMode } = context;
  const inner = parseSubject(text.replace(/[\r\n]+/g, ' '))
    .map((part) => {
      if (part.type === 'text') return escapeText(part.text);
      if (fieldMode === 'liquid') return liquidField(part.name, undefined);
      if (fieldMode === 'placeholder') return escapeText(`[${part.name}]`);
      return escapeText(fieldMode.values[part.name]?.trim() ?? '');
    })
    .join('');
  return `<mj-preview>${inner}</mj-preview>`;
}

function letterMjml(doc: WriteDocument, context: RenderContext): string {
  const { look, imageSrc, textSize } = context;
  const logo = look.logo
    ? `<div style="padding:0 0 16px"><img src="${escapeAttribute(imageSrc(look.logo.assetId))}" alt="${escapeAttribute(look.logo.alt)}" width="${String(Math.min(look.logo.width, MAX_LOGO_WIDTH))}" style="display:block;max-width:100%;height:auto;border:0" /></div>`
    : '';
  const blocks = doc.content.map((block) => letterBlock(block, context)).join('\n');
  return [
    '<mjml>',
    '<mj-head>',
    previewMjml(doc, context),
    // On phones, columns sit one under the other.
    '<mj-style>@media only screen and (max-width:480px){.pl-columns,.pl-columns tbody,.pl-columns tr,.pl-column{display:block!important;width:100%!important}.pl-column{padding:0!important}}</mj-style>',
    '</mj-head>',
    '<mj-body>',
    '<mj-raw>',
    `<div style="font-family:${escapeAttribute(look.fontFamily)};font-size:${String(textSize)}px;line-height:1.6;color:#222222;padding:8px 4px;text-align:left">`,
    logo,
    blocks,
    '</div>',
    '</mj-raw>',
    '</mj-body>',
    '</mjml>',
  ].join('\n');
}

function letterBlock(block: BlockNode, context: RenderContext): string {
  const { look, fieldMode, imageSrc } = context;
  switch (block.type) {
    case 'paragraph':
      return `<p style="margin:0 0 14px${letterAlign(block.attrs?.textAlign)}">${renderInline(block.content, fieldMode) || '&nbsp;'}</p>`;
    case 'heading': {
      const tag = `h${String(block.attrs.level)}`;
      return `<${tag} style="${LETTER_HEADING_MARGIN};font-size:${HEADING_SIZES[block.attrs.level]};line-height:1.3;font-weight:700${letterAlign(block.attrs.textAlign)}">${renderInline(block.content, fieldMode)}</${tag}>`;
    }
    case 'bulletList':
    case 'orderedList':
      return renderList(block, fieldMode, 'margin:0 0 14px;padding-left:28px');
    case 'button': {
      const href = safeHref(block.attrs.href);
      const hrefAttribute = href ? ` href="${escapeAttribute(href)}"` : '';
      return [
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px;border-collapse:separate">',
        `<tr><td style="border-radius:5px;background-color:${look.primaryColor}">`,
        `<a${hrefAttribute} style="display:inline-block;padding:11px 24px;border-radius:5px;color:#FFFFFF;font-weight:700;text-decoration:none">${escapeText(block.attrs.label)}</a>`,
        '</td></tr></table>',
      ].join('');
    }
    case 'horizontalRule':
      return '<hr style="border:0;border-top:1px solid #DDDDDD;margin:18px 0" />';
    case 'image': {
      const { assetId, alt, width, align, href } = block.attrs;
      const img = `<img src="${escapeAttribute(imageSrc(assetId))}" alt="${escapeAttribute(alt)}" width="${String(width)}" style="display:inline-block;max-width:100%;height:auto;border:0" />`;
      const link = href ? safeHref(href) : null;
      const picture = link ? `<a href="${escapeAttribute(link)}">${img}</a>` : img;
      return `<div style="margin:4px 0 14px;text-align:${align ?? 'left'}">${picture}</div>`;
    }
    case 'spacer': {
      const height = String(block.attrs.height);
      return `<div style="height:${height}px;line-height:${height}px;font-size:1px">&nbsp;</div>`;
    }
    case 'footer':
      return `<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#6B6B6B">${renderInline(block.content, fieldMode)}</p>`;
    case 'table':
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"${block.attrs?.fit ? '' : ' width="100%"'} style="border-collapse:collapse;${block.attrs?.fit ? '' : 'width:100%;'}margin:4px 0 16px;font-size:${String(context.textSize - 1)}px;line-height:1.5;color:#222222">${tableRows(block, fieldMode)}</table>`;
    case 'columns': {
      const width = `${String(Math.floor(100 / block.content.length))}%`;
      const cells = block.content
        .map(
          (column, index) =>
            `<td class="pl-column" valign="top" width="${width}" style="vertical-align:top;padding:0 ${index === block.content.length - 1 ? '0' : '16px'} 0 0">${column.content.map((child) => letterBlock(child, context)).join('\n')}</td>`,
        )
        .join('');
      return `<table role="presentation" class="pl-columns" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;margin:0 0 4px"><tr>${cells}</tr></table>`;
    }
    case 'conditional': {
      const inner = block.content.map((child) => letterBlock(child, context)).join('\n');
      if (fieldMode === 'placeholder') return inner;
      if (fieldMode !== 'liquid') {
        return conditionHolds(block.attrs, context.conditionValues ?? fieldMode.values)
          ? inner
          : '';
      }
      return [liquidCondition(block.attrs), inner, '{% endif %}'].join('\n');
    }
  }
}

function letterAlign(align: 'left' | 'center' | 'right' | null | undefined): string {
  return align && align !== 'left' ? `;text-align:${align}` : '';
}

/** Whether a "show only if" part shows for someone with these details. */
export function conditionHolds(
  rule: { field: string; op: ConditionOp; value?: string | undefined },
  values: Record<string, string>,
): boolean {
  const actual = (values[rule.field] ?? '').trim();
  const expected = (rule.value ?? '').trim();
  switch (rule.op) {
    case 'notEmpty':
      return actual !== '';
    case 'isEmpty':
      return actual === '';
    case 'equals':
      return actual.toLowerCase() === expected.toLowerCase();
    case 'notEquals':
      return actual.toLowerCase() !== expected.toLowerCase();
  }
}

/**
 * The Liquid tag that opens a "show only if" part. Field names and values
 * are validated (`fieldNameSchema`: no quotes, braces or %), so they can't
 * break out of the string. Comparisons ignore upper/lower case, like
 * `conditionHolds`.
 */
function liquidCondition(rule: { field: string; op: ConditionOp; value?: string | undefined }) {
  const detail = `row["${rule.field}"]`;
  const value = (rule.value ?? '').trim().toLowerCase();
  switch (rule.op) {
    case 'notEmpty':
      return `{% if ${detail} != blank %}`;
    case 'isEmpty':
      return `{% if ${detail} == blank %}`;
    case 'equals':
      return `{% assign pl_value = ${detail} | strip | downcase %}{% if pl_value == "${value}" %}`;
    case 'notEquals':
      return `{% assign pl_value = ${detail} | strip | downcase %}{% if pl_value != "${value}" %}`;
  }
}

function renderTable(table: TableNode, fieldMode: FieldMode): string {
  const width = table.attrs?.fit ? 'auto' : '100%';
  return `<mj-table width="${width}" font-size="15px" line-height="1.5" color="#222222" padding="10px 0">${tableRows(table, fieldMode)}</mj-table>`;
}

/** Room inside each cell, by the table's spacing. */
const CELL_PADDING = { compact: '4px 8px', normal: '8px 10px', roomy: '12px 14px' } as const;
/** What the lines looked like before tables had a border colour. */
const HEADER_LINE = '#DDDDDD';
const ROW_LINE = '#EEEEEE';
/** Width the editor gives a column nobody has resized. */
const DEFAULT_COLUMN_PX = 120;

/**
 * The table's column widths as percentages, when any column was resized in
 * the editor (read from the first row); null leaves the columns to the email app.
 */
export function columnPercents(table: TableNode): number[] | null {
  const first = table.content[0];
  if (!first) return null;
  const widths: (number | null)[] = [];
  for (const cell of first.content) {
    const span = cell.attrs?.colspan ?? 1;
    const sized = cell.attrs?.colwidth;
    for (let i = 0; i < span; i += 1) widths.push(sized?.[i] ?? null);
  }
  if (widths.every((width) => width === null)) return null;
  const px = widths.map((width) => width ?? DEFAULT_COLUMN_PX);
  const total = px.reduce((sum, width) => sum + width, 0);
  return px.map((width) => Math.round((width / total) * 1000) / 10);
}

/** White or near-black text, whichever reads better on this background. */
export function readableTextOn(hex: string): string {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return luminance > 0.4 ? '#222222' : '#FFFFFF';
}

/**
 * The rows of a table as HTML, with every look setting as an inline style or
 * attribute on the cells: what Outlook, Gmail and Apple Mail all respect.
 */
function tableRows(table: TableNode, fieldMode: FieldMode): string {
  const attrs = table.attrs;
  const striped = attrs?.striped ?? false;
  const borders = attrs?.borders ?? 'rows';
  const padding = CELL_PADDING[attrs?.spacing ?? 'normal'];
  const percents = columnPercents(table);

  return table.content
    .map((row, rowIndex) => {
      const stripe = striped && rowIndex % 2 === 1 ? ' style="background-color:#F6F7F9"' : '';
      let column = 0;
      const cells = row.content
        .map((cell) => {
          const header = cell.type === 'tableHeader';
          const tag = header ? 'th' : 'td';
          const colspan = cell.attrs?.colspan ?? 1;
          const span = [
            colspan > 1 ? ` colspan="${String(colspan)}"` : '',
            cell.attrs?.rowspan && cell.attrs.rowspan > 1
              ? ` rowspan="${String(cell.attrs.rowspan)}"`
              : '',
          ].join('');

          // Widths go on the first row only, as an attribute (for Outlook) and a style.
          let width = '';
          const style = [`padding:${padding}`];
          if (rowIndex === 0 && percents) {
            const share = percents.slice(column, column + colspan).reduce((a, b) => a + b, 0);
            width = ` width="${String(Math.round(share * 10) / 10)}%"`;
            style.push(`width:${String(Math.round(share * 10) / 10)}%`);
          }
          column += colspan;

          style.push(`text-align:${cell.content[0]?.attrs?.textAlign ?? 'left'}`);
          if (cell.attrs?.valign) style.push(`vertical-align:${cell.attrs.valign}`);

          const background = cell.attrs?.background ?? (header ? attrs?.headerColor : undefined);
          if (background) {
            style.push(`background-color:${background}`, `color:${readableTextOn(background)}`);
          }
          if (header) style.push('font-weight:700');

          if (borders === 'grid') {
            style.push(`border:1px solid ${attrs?.borderColor ?? HEADER_LINE}`);
          } else if (borders === 'rows') {
            style.push(
              header
                ? `border-bottom:2px solid ${attrs?.borderColor ?? HEADER_LINE}`
                : `border-bottom:1px solid ${attrs?.borderColor ?? ROW_LINE}`,
            );
          }

          const text = cell.content.map((p) => renderInline(p.content, fieldMode)).join('<br />');
          return `<${tag}${span}${width} style="${style.join(';')}">${text}</${tag}>`;
        })
        .join('');
      return `<tr${stripe}>${cells}</tr>`;
    })
    .join('');
}

function renderList(
  list: ListNode,
  fieldMode: FieldMode,
  style = 'margin:0;padding-left:22px',
): string {
  const items = list.content
    .map((item) => {
      const parts = item.content.map((child) =>
        child.type === 'paragraph'
          ? renderInline(child.content, fieldMode)
          : renderList(child, fieldMode),
      );
      return `<li>${parts.join('<br />')}</li>`;
    })
    .join('');
  if (list.type === 'bulletList') {
    return `<ul style="${style}">${items}</ul>`;
  }
  const start = list.attrs?.start;
  const startAttribute = start !== undefined && start !== 1 ? ` start="${String(start)}"` : '';
  return `<ol${startAttribute} style="${style}">${items}</ol>`;
}

function alignAttribute(align: 'left' | 'center' | 'right' | null | undefined): string {
  return align && align !== 'left' ? ` align="${align}"` : '';
}

function renderInline(nodes: InlineNode[] | undefined, fieldMode: FieldMode): string {
  return (nodes ?? [])
    .map((node) => {
      switch (node.type) {
        case 'text':
          return applyMarks(escapeText(node.text), node.marks ?? []);
        case 'hardBreak':
          return '<br />';
        case 'field':
          if (fieldMode === 'liquid') return liquidField(node.attrs.name, node.attrs.fallback);
          if (fieldMode === 'placeholder') return escapeText(`[${node.attrs.name}]`);
          return escapeText(fieldMode.values[node.attrs.name]?.trim() || node.attrs.fallback || '');
      }
    })
    .join('');
}

function applyMarks(html: string, marks: Mark[]): string {
  return marks.reduce((inner, mark) => {
    switch (mark.type) {
      case 'bold':
        return `<strong>${inner}</strong>`;
      case 'italic':
        return `<em>${inner}</em>`;
      case 'underline':
        return `<u>${inner}</u>`;
      case 'link': {
        const href = safeHref(mark.attrs.href);
        return href
          ? `<a href="${escapeAttribute(href)}" style="color:inherit">${inner}</a>`
          : inner;
      }
      case 'textColor':
        return HEX_COLOUR.test(mark.attrs.color)
          ? `<span style="color:${mark.attrs.color}">${inner}</span>`
          : inner;
      case 'highlight':
        return HEX_COLOUR.test(mark.attrs.color)
          ? `<span style="background-color:${mark.attrs.color}">${inner}</span>`
          : inner;
    }
  }, html);
}

/** Field names and fallbacks are validated by `fieldNameSchema` (no quotes or braces). */
function liquidField(name: string, fallback: string | undefined): string {
  const defaultFilter = fallback ? ` | default: "${fallback}"` : '';
  return `{{ row["${name}"]${defaultFilter} }}`;
}

export function safeHref(href: string): string | null {
  try {
    const url = new URL(href.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function sanitiseBrand(brand: BrandLook): BrandLook {
  return {
    logo: brand.logo && /^[A-Za-z0-9-]{1,64}$/.test(brand.logo.assetId) ? brand.logo : null,
    primaryColor: HEX_COLOUR.test(brand.primaryColor)
      ? brand.primaryColor
      : DEFAULT_BRAND.primaryColor,
    backgroundColor: HEX_COLOUR.test(brand.backgroundColor)
      ? brand.backgroundColor
      : DEFAULT_BRAND.backgroundColor,
    fontFamily: SAFE_FONT_STACK.test(brand.fontFamily)
      ? brand.fontFamily
      : DEFAULT_BRAND.fontFamily,
    // Typed text: escaped like the letter's own words when rendered.
    signature: brand.signature ?? null,
  };
}

function escapeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/{/g, '&#123;')
    .replace(/}/g, '&#125;');
}

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
