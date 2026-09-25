import type { BlockNode, InlineNode, ListItemNode, WriteDocument } from './document';
import { safeHref } from './to-mjml';

/**
 * The live "Checklist" (PLAN §8.3): problems a person can fix before sending.
 * Pure and UI-free, so the editor and the send wizard show the same results.
 */
export type CheckSeverity = 'mustFix' | 'worthALook';

export interface TemplateProblem {
  /** i18n key under `checks.` */
  id:
    | 'subjectMissing'
    | 'subjectLong'
    | 'letterEmpty'
    | 'linkInvalid'
    | 'buttonLinkInvalid'
    | 'buttonLinkExample'
    | 'tooLarge';
  severity: CheckSeverity;
  /** Values for the message, e.g. the button label. */
  values?: Record<string, string | number>;
}

/** Most inboxes cut the subject off around here. */
export const SUBJECT_SOFT_LIMIT = 78;
/** Gmail clips messages over ~102 KB and hides the rest behind "View entire message". */
export const GMAIL_CLIP_BYTES = 102 * 1024;

const EXAMPLE_HOST = /(^|\.)example\.(com|org|net)$/i;

export function checkTemplate(input: {
  subject: string;
  document: WriteDocument;
  /** Size of the compiled HTML, when known. */
  htmlBytes?: number | undefined;
}): TemplateProblem[] {
  const problems: TemplateProblem[] = [];
  const subject = input.subject.trim();

  if (!subject) problems.push({ id: 'subjectMissing', severity: 'mustFix' });
  else if (subject.length > SUBJECT_SOFT_LIMIT) {
    problems.push({
      id: 'subjectLong',
      severity: 'worthALook',
      values: { count: subject.length, limit: SUBJECT_SOFT_LIMIT },
    });
  }

  if (!hasContent(input.document)) problems.push({ id: 'letterEmpty', severity: 'mustFix' });

  for (const block of input.document.content) {
    if (block.type === 'button') {
      const href = safeHref(block.attrs.href);
      if (!href) {
        problems.push({
          id: 'buttonLinkInvalid',
          severity: 'mustFix',
          values: { label: block.attrs.label },
        });
      } else if (isExampleLink(href)) {
        problems.push({
          id: 'buttonLinkExample',
          severity: 'mustFix',
          values: { label: block.attrs.label },
        });
      }
    }
  }

  const badLinks = new Set<string>();
  forEachInline(input.document, (node) => {
    if (node.type !== 'text') return;
    for (const mark of node.marks ?? []) {
      if (mark.type === 'link' && !safeHref(mark.attrs.href)) badLinks.add(node.text);
    }
  });
  for (const text of badLinks) {
    problems.push({ id: 'linkInvalid', severity: 'mustFix', values: { text } });
  }

  if (input.htmlBytes !== undefined && input.htmlBytes > GMAIL_CLIP_BYTES) {
    problems.push({
      id: 'tooLarge',
      severity: 'worthALook',
      values: { size: Math.round(input.htmlBytes / 1024) },
    });
  }
  return problems;
}

function isExampleLink(href: string): boolean {
  try {
    const url = new URL(href);
    return url.protocol !== 'mailto:' && EXAMPLE_HOST.test(url.hostname);
  } catch {
    return false;
  }
}

function hasContent(doc: WriteDocument): boolean {
  const inline: InlineNode[] = [];
  forEachInline(doc, (node) => inline.push(node));
  return (
    inline.some((node) => node.type === 'field' || (node.type === 'text' && node.text.trim())) ||
    doc.content.some((block) => block.type === 'button')
  );
}

function forEachInline(doc: WriteDocument, visit: (node: InlineNode) => void): void {
  const visitBlock = (block: BlockNode | ListItemNode['content'][number]) => {
    switch (block.type) {
      case 'paragraph':
      case 'heading':
        (block.content ?? []).forEach(visit);
        break;
      case 'bulletList':
      case 'orderedList':
        for (const item of block.content) item.content.forEach(visitBlock);
        break;
      default:
        break;
    }
  };
  doc.content.forEach(visitBlock);
}
