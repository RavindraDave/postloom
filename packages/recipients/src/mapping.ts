/** Which columns hold the addresses (and which rows to leave out). */
export interface ColumnMapping {
  to: string | null;
  cc: string | null;
  bcc: string | null;
  /** A column like "Send?" or "Enabled": rows with no/false/0 are left out. */
  enabled: string | null;
  /** Files to attach, as paths (several separated by `;`). */
  attachments: string | null;
}

/** Which column fills each personal detail the template uses. */
export type FieldMap = Record<string, string | null>;

const PATTERNS: Record<keyof ColumnMapping, RegExp> = {
  to: /^(to|e-?mail( address)?|mail|email id|recipient|address)$/i,
  cc: /^cc$/i,
  bcc: /^bcc$/i,
  enabled: /^(enabled?|send\??|active|include)$/i,
  attachments: /^(attachments?|files?|attach)$/i,
};

/** Guesses the address columns from their names (To / Email / E-mail / Mail…). */
export function guessMapping(headers: string[]): ColumnMapping {
  const find = (key: keyof ColumnMapping) =>
    headers.find((header) => PATTERNS[key].test(header.trim())) ?? null;
  return {
    to: find('to'),
    cc: find('cc'),
    bcc: find('bcc'),
    enabled: find('enabled'),
    attachments: find('attachments'),
  };
}

const squash = (text: string) => text.toLowerCase().replace(/[\s_-]+/g, '');

/**
 * Matches each detail the template uses to a column: exactly first, then
 * ignoring case, spaces, dashes and underscores. A remembered choice wins
 * when that column still exists.
 */
export function matchFields(
  fields: string[],
  headers: string[],
  remembered: FieldMap = {},
): FieldMap {
  const map: FieldMap = {};
  for (const field of fields) {
    const previous = remembered[field];
    if (previous && headers.includes(previous)) {
      map[field] = previous;
      continue;
    }
    map[field] =
      headers.find((header) => header === field) ??
      headers.find((header) => squash(header) === squash(field)) ??
      null;
  }
  return map;
}

/** Keeps a remembered mapping only where those columns still exist. */
export function reconcileMapping(saved: Partial<ColumnMapping>, headers: string[]): ColumnMapping {
  const guess = guessMapping(headers);
  const keep = (value: string | null | undefined, fallback: string | null) =>
    value && headers.includes(value) ? value : fallback;
  return {
    to: keep(saved.to, guess.to),
    cc: keep(saved.cc, guess.cc),
    bcc: keep(saved.bcc, guess.bcc),
    enabled: keep(saved.enabled, guess.enabled),
    attachments: keep(saved.attachments, guess.attachments),
  };
}
