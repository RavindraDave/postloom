import { fieldNameSchema, walkBlocks, walkInline, type WriteDocument } from './document';
import { formatValues, type DetailFormat } from './formats';

/**
 * Subjects are stored as plain text where a personal detail is written
 * `{{First Name}}`. People never type or see that: the editor shows chips.
 * Detail names can't contain braces or quotes (`fieldNameSchema`), so a
 * detail can never break out of its marker.
 */
const FIELD_TOKEN = /\{\{([^{}]{1,64})\}\}/g;

export type SubjectPart = { type: 'text'; text: string } | { type: 'field'; name: string };

/** Splits a stored subject into text and details. */
export function parseSubject(subject: string): SubjectPart[] {
  const parts: SubjectPart[] = [];
  let last = 0;
  for (const match of subject.matchAll(FIELD_TOKEN)) {
    const name = (match[1] ?? '').trim();
    if (!fieldNameSchema.safeParse(name).success) continue;
    if (match.index > last) parts.push({ type: 'text', text: subject.slice(last, match.index) });
    parts.push({ type: 'field', name });
    last = match.index + match[0].length;
  }
  if (last < subject.length) parts.push({ type: 'text', text: subject.slice(last) });
  return parts;
}

/**
 * Joins parts into a stored subject. Typed text can't create a detail: any
 * `{{` or `}}` in it is split with a space.
 */
export function formatSubject(parts: SubjectPart[]): string {
  return parts
    .map((part) =>
      part.type === 'field'
        ? `{{${part.name}}}`
        : part.text
            .replace(/\{\{/g, '{ {')
            .replace(/\}\}/g, '} }')
            .replace(/[\r\n]+/g, ' '),
    )
    .join('');
}

/** Details used in the subject, in order of first use. */
export function subjectFields(subject: string): string[] {
  return [
    ...new Set(parseSubject(subject).flatMap((part) => (part.type === 'field' ? [part.name] : []))),
  ];
}

/**
 * The subject for one email. With no values (tests and previews) details
 * show as "[First Name]". Values never add line breaks to the header.
 */
export function renderSubject(
  subject: string,
  values?: Record<string, string>,
  formats?: Partial<Record<string, DetailFormat>>,
): string {
  const shown = values && formatValues(values, formats);
  return parseSubject(subject)
    .map((part) => {
      if (part.type === 'text') return part.text;
      if (!shown) return `[${part.name}]`;
      return (shown[part.name] ?? '').replace(/[\r\n]+/g, ' ');
    })
    .join('')
    .trim();
}

/**
 * Every personal detail a template uses (subject and letter), and whether an
 * empty value is fine: the detail has an "if empty" text everywhere it
 * appears, or it's only used to decide a "show only if" part.
 */
export function templateFields(
  subject: string,
  document: WriteDocument,
): { name: string; hasFallback: boolean }[] {
  const order: string[] = [];
  const needsValue = new Map<string, boolean>();
  const note = (name: string, needs: boolean) => {
    if (!needsValue.has(name)) order.push(name);
    needsValue.set(name, (needsValue.get(name) ?? false) || needs);
  };
  for (const name of subjectFields(subject)) note(name, true);
  walkBlocks(document, (block) => {
    if (block.type === 'conditional') note(block.attrs.field, false);
  });
  walkInline(document, (node) => {
    if (node.type === 'field') note(node.attrs.name, !node.attrs.fallback);
  });
  return order.map((name) => ({ name, hasFallback: !needsValue.get(name) }));
}
