import type { SendRecipient } from '@postloom/db';

/**
 * Makes one CSV cell safe: quoted when needed, and never read as a formula.
 * A cell starting with = + - @ (or a tab or carriage return) could run as a
 * formula when the report is opened in a spreadsheet ("CSV injection"), so
 * it gets a leading apostrophe.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Tells Excel the file is UTF-8 (so accents and symbols like £ show correctly). */
const BYTE_ORDER_MARK = '\uFEFF';

export function toCsv(rows: string[][]): string {
  return `${BYTE_ORDER_MARK}${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

const STATUS_WORDS: Record<SendRecipient['status'], string> = {
  sent: 'Sent',
  failed: "Couldn't send",
  skipped: 'Left out',
  uncertain: 'May or may not have been sent',
  pending: 'Not sent yet',
  sending: 'Not sent yet',
};

const REASON_WORDS: Record<string, string> = {
  rejected: 'Their email provider refused it (the address may not exist)',
  temporary: 'Their email provider kept saying "try later"',
  invalid: "The email couldn't be made (a line break in an address?)",
  template: "The email couldn't be made from the template",
  attachmentMissing: 'A file to attach had gone',
  attachmentBlocked: 'A file to attach was a private file',
  attachmentTooBig: 'The attachments were too big for one email',
  interrupted: 'Postloom closed while sending',
  uncertainSkipped: 'Skipped: may or may not have been sent',
  doNotEmail: 'On the "Do not email" list',
  skipped: 'Left out when sending',
  disabled: 'Not marked to send',
  duplicate: 'The same address as an earlier row',
};

/** A plain-words reason for a report, from the engine's short code (e.g. `rejected:550`). */
export function reasonWords(errorCode: string | null): string {
  if (!errorCode) return '';
  const [code = '', detail] = errorCode.split(':');
  const words = REASON_WORDS[code] ?? 'Could not be sent';
  return detail ? `${words} (${detail})` : words;
}

/** Everyone in a send, one row each: what happened and why. */
export function buildReport(people: SendRecipient[]): string {
  return toCsv([
    ['Row', 'To', 'Cc', 'Bcc', 'Status', 'Why', 'When', 'Message ID'],
    ...people.map((person) => [
      String(person.rowNo),
      person.to.join('; '),
      person.cc.join('; '),
      person.bcc.join('; '),
      STATUS_WORDS[person.status],
      person.status === 'sent' ? '' : reasonWords(person.errorCode),
      person.status === 'sent' ? person.updatedAt : '',
      person.messageId ?? '',
    ]),
  ]);
}
