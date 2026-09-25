import { describe, expect, it } from 'vitest';
import { checkRecipients, type CheckInput } from './checks';
import { guessMapping, matchFields, reconcileMapping } from './mapping';
import { buildRecipients, splitAddresses } from './recipients';
import { columnLetter, toRecipientTable } from './table';

describe('finding the header row', () => {
  it('skips title rows above the headers and empty rows below', () => {
    const table = toRecipientTable([
      ['September invoices'],
      [],
      ['Email', 'First Name', '', 'Name'],
      ['a@example.com', 'Asha', 'x', 'A'],
      ['', '', '', ''],
      ['b@example.com', 'Bo', '', 'B'],
    ]);
    expect(table.headers).toEqual(['Email', 'First Name', 'Column C', 'Name']);
    expect(table.rows.map((row) => row.rowNo)).toEqual([4, 6]);
  });

  it('names repeated headers so every column can be told apart', () => {
    expect(toRecipientTable([['Name', 'name', 'Name']]).headers).toEqual([
      'Name',
      'name (2)',
      'Name (3)',
    ]);
  });

  it('numbers columns like Excel', () => {
    expect([0, 25, 26, 27, 701].map(columnLetter)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ']);
  });
});

describe('matching columns', () => {
  it('finds the address columns from their names', () => {
    expect(guessMapping(['First Name', 'E-mail', 'CC', 'Send?'])).toEqual({
      to: 'E-mail',
      cc: 'CC',
      bcc: null,
      enabled: 'Send?',
    });
  });

  it('matches template details to columns, loosely, and remembers choices', () => {
    const headers = ['first_name', 'Invoice No', 'Total'];
    expect(matchFields(['First Name', 'Invoice No', 'Amount'], headers)).toEqual({
      'First Name': 'first_name',
      'Invoice No': 'Invoice No',
      Amount: null,
    });
    expect(matchFields(['Amount'], headers, { Amount: 'Total' })).toEqual({ Amount: 'Total' });
    expect(matchFields(['Amount'], headers, { Amount: 'Gone' })).toEqual({ Amount: null });
  });

  it('keeps a remembered mapping only where the columns still exist', () => {
    expect(reconcileMapping({ to: 'Mail', cc: 'Old CC' }, ['Mail', 'Email'])).toEqual({
      to: 'Mail',
      cc: null,
      bcc: null,
      enabled: null,
    });
  });
});

describe('addresses', () => {
  it('splits several addresses in one cell and flags bad ones', () => {
    expect(splitAddresses(' A@Example.com; b@example.com , not-an-email ')).toEqual({
      valid: ['a@example.com', 'b@example.com'],
      invalid: ['not-an-email'],
    });
  });

  it('never accepts an address that could forge email headers', () => {
    expect(splitAddresses('a@example.com\nBcc: evil@example.com').invalid).toHaveLength(1);
    expect(splitAddresses('Evil <evil@example.com>').invalid).toHaveLength(1);
  });
});

const table = toRecipientTable([
  ['Email', 'First Name', 'Send?', 'Plan'],
  ['a@example.com', 'Asha', 'yes', 'Gold'],
  ['b@example.com', '', 'yes', ''],
  ['A@example.com', 'Asha again', 'yes', ''],
  ['c@example', 'Cy', 'yes', ''],
  ['', 'Nobody', 'yes', ''],
  ['d@example.com', 'Dee', 'no', ''],
  ['stop@example.com', 'Stop', 'yes', ''],
]);
const mapping = guessMapping(table.headers);
const recipients = buildRecipients(table, mapping, {
  'First Name': 'First Name',
  Name: 'First Name',
});

const input = (changes: Partial<CheckInput> = {}): CheckInput => ({
  recipients,
  fields: [{ name: 'First Name', hasFallback: false }],
  fieldMap: { 'First Name': 'First Name' },
  doNotEmail: new Set(['stop@example.com']),
  remainingToday: 450,
  skipRows: new Set(),
  sendDuplicatesOnce: true,
  ...changes,
});

describe('building people from rows', () => {
  it('fills details by template field name and by column name', () => {
    expect(recipients[0]).toMatchObject({
      rowNo: 2,
      to: ['a@example.com'],
      enabled: true,
      values: { Email: 'a@example.com', 'First Name': 'Asha', Name: 'Asha', Plan: 'Gold' },
    });
    expect(recipients.find((recipient) => recipient.rowNo === 7)?.enabled).toBe(false);
  });
});

describe('checking everyone before sending', () => {
  it('finds what must be fixed and what is worth a look', () => {
    const result = checkRecipients(input());
    expect(result.problems).toEqual([
      { id: 'noAddress', severity: 'mustFix', rows: [6] },
      { id: 'invalidAddress', severity: 'mustFix', rows: [5] },
      { id: 'emptyDetail', severity: 'worthALook', rows: [3], values: { field: 'First Name' } },
      { id: 'duplicate', severity: 'info', rows: [4] },
      { id: 'doNotEmail', severity: 'info', rows: [8] },
      { id: 'disabled', severity: 'info', rows: [7] },
    ]);
    expect(result.leftOut).toEqual([
      { rowNo: 4, reason: 'duplicate' },
      { rowNo: 7, reason: 'disabled' },
      { rowNo: 8, reason: 'doNotEmail' },
    ]);
  });

  it('is ready once the bad rows are left out', () => {
    const result = checkRecipients(input({ skipRows: new Set([5, 6]) }));
    expect(result.problems.filter((problem) => problem.severity === 'mustFix')).toEqual([]);
    expect(result.toSend.map((recipient) => recipient.rowNo)).toEqual([2, 3]);
  });

  it('warns about the same person twice when sending to duplicates is chosen', () => {
    const result = checkRecipients(input({ sendDuplicatesOnce: false, skipRows: new Set([5, 6]) }));
    expect(result.problems).toContainEqual({ id: 'duplicate', severity: 'worthALook', rows: [4] });
    expect(result.toSend).toHaveLength(3);
  });

  it('needs every template detail to have a column', () => {
    const result = checkRecipients(
      input({ fields: [{ name: 'Amount', hasFallback: false }], fieldMap: { Amount: null } }),
    );
    expect(result.problems[0]).toEqual({
      id: 'missingColumn',
      severity: 'mustFix',
      rows: [],
      values: { field: 'Amount' },
    });
  });

  it('only mentions an unmatched detail that has an "if empty" text', () => {
    const result = checkRecipients(
      input({ fields: [{ name: 'Company', hasFallback: true }], fieldMap: { Company: null } }),
    );
    expect(result.problems[0]).toMatchObject({ id: 'missingColumn', severity: 'worthALook' });
  });

  it('does not worry about empty details that have an "if empty" text', () => {
    const result = checkRecipients(input({ fields: [{ name: 'First Name', hasFallback: true }] }));
    expect(result.problems.some((problem) => problem.id === 'emptyDetail')).toBe(false);
  });

  it('stops before going over today’s limit', () => {
    const result = checkRecipients(input({ remainingToday: 1, skipRows: new Set([5, 6]) }));
    expect(result.problems).toContainEqual({
      id: 'overDailyLimit',
      severity: 'mustFix',
      rows: [3],
      values: { count: 2, remaining: 1 },
    });
  });

  it('mentions very large sends', () => {
    const many = Array.from({ length: 2_001 }, (_, i) => ({
      ...recipients[0]!,
      rowNo: i + 2,
      to: [`p${String(i)}@example.com`],
    }));
    const result = checkRecipients(input({ recipients: many, remainingToday: 5_000 }));
    expect(result.problems).toContainEqual({
      id: 'largeSend',
      severity: 'worthALook',
      rows: [],
      values: { count: 2_001 },
    });
  });
});

describe('single-column lists', () => {
  it('uses the one-cell header', () => {
    const single = toRecipientTable([['Email'], ['a@example.com'], ['b@example.com']]);
    expect(single.headers).toEqual(['Email']);
    expect(single.rows).toHaveLength(2);
  });
});
