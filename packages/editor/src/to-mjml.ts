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
}

/** A sender's saved brand look (see the contracts' `brandSchema`). */
export interface SavedBrand {
  primaryColor: string;
  fontFamily: string;
  logo: { assetId: string; width: number } | null;
}

/** How emails from a sender look; the plain look when it has no brand. */
export function lookFromBrand(brand: SavedBrand | null | undefined, logoAlt: string): BrandLook {
  if (!brand) return DEFAULT_BRAND;
  return {
    ...DEFAULT_BRAND,
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

/** Fonts that look the same in (almost) every email app. */
export const EMAIL_FONTS = [
  { id: 'arial', label: 'Arial', stack: 'Arial, Helvetica, sans-serif' },
  { id: 'verdana', label: 'Verdana', stack: 'Verdana, Geneva, sans-serif' },
  { id: 'tahoma', label: 'Tahoma', stack: 'Tahoma, Geneva, sans-serif' },
  { id: 'trebuchet', label: 'Trebuchet MS', stack: "'Trebuchet MS', Helvetica, sans-serif" },
  { id: 'georgia', label: 'Georgia', stack: 'Georgia, Times, serif' },
  { id: 'times', label: 'Times New Roman', stack: "'Times New Roman', Times, serif" },
  { id: 'courier', label: 'Courier New', stack: "'Courier New', Courier, monospace" },
] as const;

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
 * The letter becomes a run of white sections: plain blocks share one
 * section, and each set of columns gets its own, so the email reads as one
 * page. Everything the user typed is HTML-escaped, and `{` is encoded so
 * typed text can never become a Liquid tag. Only http(s) and mailto links
 * survive.
 */
export function writeDocumentToMjml(
  doc: WriteDocument,
  brand: BrandLook = DEFAULT_BRAND,
  fieldMode: FieldMode = 'liquid',
  imageSrc: ImageSource = inlineImageSource,
): string {
  const look = sanitiseBrand(brand);
  const context: RenderContext = { look, fieldMode, imageSrc };
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
    '<mj-attributes>',
    `<mj-all font-family="${escapeAttribute(look.fontFamily)}" />`,
    '<mj-text font-size="16px" line-height="1.6" color="#222222" padding="6px 0" />',
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
        return conditionHolds(block.attrs, fieldMode.values) ? inner : '';
      }
      return [
        `<mj-raw>${liquidCondition(block.attrs)}</mj-raw>`,
        inner,
        '<mj-raw>{% endif %}</mj-raw>',
      ].join('\n');
    }
  }
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
  const striped = table.attrs?.striped ?? false;
  const rows = table.content
    .map((row, index) => {
      const background = striped && index % 2 === 1 ? ' style="background-color:#F6F7F9"' : '';
      const cells = row.content
        .map((cell) => {
          const tag = cell.type === 'tableHeader' ? 'th' : 'td';
          const span = [
            cell.attrs?.colspan && cell.attrs.colspan > 1
              ? ` colspan="${String(cell.attrs.colspan)}"`
              : '',
            cell.attrs?.rowspan && cell.attrs.rowspan > 1
              ? ` rowspan="${String(cell.attrs.rowspan)}"`
              : '',
          ].join('');
          const style =
            cell.type === 'tableHeader'
              ? 'padding:8px 10px;border-bottom:2px solid #DDDDDD;text-align:left;font-weight:700'
              : 'padding:8px 10px;border-bottom:1px solid #EEEEEE;text-align:left';
          const text = cell.content.map((p) => renderInline(p.content, fieldMode)).join('<br />');
          return `<${tag}${span} style="${style}">${text}</${tag}>`;
        })
        .join('');
      return `<tr${background}>${cells}</tr>`;
    })
    .join('');
  return `<mj-table font-size="15px" line-height="1.5" color="#222222" padding="10px 0">${rows}</mj-table>`;
}

function renderList(list: ListNode, fieldMode: FieldMode): string {
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
    return `<ul style="margin:0;padding-left:22px">${items}</ul>`;
  }
  const start = list.attrs?.start;
  const startAttribute = start !== undefined && start !== 1 ? ` start="${String(start)}"` : '';
  return `<ol${startAttribute} style="margin:0;padding-left:22px">${items}</ol>`;
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
