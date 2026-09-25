import { isPlausibleEmail, normaliseEmail } from '@postloom/core';
import type { ColumnMapping, FieldMap } from './mapping';
import type { RecipientTable } from './table';

/** One person to email, taken from one row of the spreadsheet. */
export interface Recipient {
  /** The row number people see in Excel. */
  rowNo: number;
  to: string[];
  cc: string[];
  bcc: string[];
  /** False when the "enabled" column says to leave this row out. */
  enabled: boolean;
  /** Personal details by template field name (plus every column by its own name). */
  values: Record<string, string>;
  /** Addresses in this row that aren't valid, as typed. */
  invalidAddresses: string[];
  /** Files to attach, as typed in the spreadsheet (checked later, in the main process). */
  attachments: string[];
}

/** Splits a cell of file paths: one per line, or separated by `;`. */
export function splitPaths(cell: string): string[] {
  return cell
    .split(/[;\r\n]+/)
    .map((path) => path.trim().replace(/^"(.*)"$/, '$1'))
    .filter(Boolean);
}

const NO_VALUES = new Set(['no', 'n', 'false', '0', 'off', 'skip', 'x']);

/**
 * Splits a cell of addresses. Several can share a cell, separated by `;` or
 * `,` (as in EmailAutomation). Addresses are trimmed and lower-cased.
 */
export function splitAddresses(cell: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const part of cell.split(/[;,]/)) {
    const address = part.trim();
    if (!address) continue;
    // Line breaks or angle brackets in an address could forge email headers.
    if (/[\r\n<>"]/.test(address) || !isPlausibleEmail(address)) invalid.push(address);
    else valid.push(normaliseEmail(address));
  }
  return { valid, invalid };
}

export function buildRecipients(
  table: RecipientTable,
  mapping: ColumnMapping,
  fieldMap: FieldMap,
): Recipient[] {
  const column = (name: string | null) => (name ? table.headers.indexOf(name) : -1);
  const toColumn = column(mapping.to);
  const ccColumn = column(mapping.cc);
  const bccColumn = column(mapping.bcc);
  const enabledColumn = column(mapping.enabled);
  const attachmentColumn = column(mapping.attachments);

  return table.rows.map(({ rowNo, cells }) => {
    const cell = (index: number) => (index >= 0 ? (cells[index] ?? '') : '');
    const to = splitAddresses(cell(toColumn));
    const cc = splitAddresses(cell(ccColumn));
    const bcc = splitAddresses(cell(bccColumn));
    const values: Record<string, string> = {};
    table.headers.forEach((header, index) => {
      values[header] = cells[index] ?? '';
    });
    for (const [field, header] of Object.entries(fieldMap)) {
      if (header) values[field] = values[header] ?? '';
    }
    return {
      rowNo,
      to: to.valid,
      cc: cc.valid,
      bcc: bcc.valid,
      enabled: enabledColumn < 0 || !NO_VALUES.has(cell(enabledColumn).trim().toLowerCase()),
      values,
      invalidAddresses: [...to.invalid, ...cc.invalid, ...bcc.invalid],
      attachments: splitPaths(cell(attachmentColumn)),
    };
  });
}
