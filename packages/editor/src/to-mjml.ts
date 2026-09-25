import type { BlockNode, InlineNode, ListNode, Mark, WriteDocument } from './document';

export interface BrandLook {
  /** Button and accent colour, as #RRGGBB. */
  primaryColor: string;
  /** CSS font stack used in the email. Web-safe fonts render most reliably. */
  fontFamily: string;
  /** Colour of the area around the email, as #RRGGBB. */
  backgroundColor: string;
}

export const DEFAULT_BRAND: BrandLook = {
  primaryColor: '#2F5D8C',
  fontFamily: 'Arial, Helvetica, sans-serif',
  backgroundColor: '#F4F5F7',
};

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;
const SAFE_FONT_STACK = /^[\w\s,'-]{1,200}$/;
const HEADING_SIZES = { 1: '28px', 2: '22px', 3: '18px' } as const;

/**
 * Converts a Write-mode document to MJML.
 *
 * Personal details become Liquid output tags (`{{ row["First Name"] }}`) that
 * are filled in per recipient after MJML compilation. Everything the user
 * typed is HTML-escaped, and `{` is encoded so typed text can never become a
 * Liquid tag. Only http(s) and mailto links survive.
 */
/**
 * How personal details are written: `liquid` for sending (filled per
 * recipient), `placeholder` for previews ("[First Name]").
 */
export type FieldMode = 'liquid' | 'placeholder';

export function writeDocumentToMjml(
  doc: WriteDocument,
  brand: BrandLook = DEFAULT_BRAND,
  fieldMode: FieldMode = 'liquid',
): string {
  const look = sanitiseBrand(brand);
  const blocks = doc.content.map((block) => renderBlock(block, look, fieldMode)).join('\n');
  return [
    '<mjml>',
    '<mj-head>',
    '<mj-attributes>',
    `<mj-all font-family="${escapeAttribute(look.fontFamily)}" />`,
    '<mj-text font-size="16px" line-height="1.6" color="#222222" padding="6px 0" />',
    '</mj-attributes>',
    '</mj-head>',
    `<mj-body background-color="${look.backgroundColor}">`,
    '<mj-section background-color="#FFFFFF" padding="32px 28px">',
    '<mj-column>',
    blocks,
    '</mj-column>',
    '</mj-section>',
    '</mj-body>',
    '</mjml>',
  ].join('\n');
}

function renderBlock(block: BlockNode, look: BrandLook, fieldMode: FieldMode): string {
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
  }
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
          return fieldMode === 'liquid'
            ? liquidField(node.attrs.name, node.attrs.fallback)
            : escapeText(`[${node.attrs.name}]`);
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
