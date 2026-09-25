import type { SendRecipient } from '@postloom/db';
import { describe, expect, it } from 'vitest';
import { buildReport, csvCell, reasonWords } from './report';

const person = (overrides: Partial<SendRecipient>): SendRecipient => ({
  id: 'r',
  sendId: 's',
  rowNo: 2,
  to: ['asha@example.com'],
  cc: [],
  bcc: [],
  values: {},
  attachments: [],
  status: 'sent',
  attempts: 1,
  messageId: '<1@example.com>',
  errorCode: null,
  updatedAt: '2026-09-25T10:00:00.000Z',
  ...overrides,
});

describe('reports', () => {
  it.each([
    ['=HYPERLINK("http://evil")', `"'=HYPERLINK(""http://evil"")"`],
    ['+1 555', "'+1 555"],
    ['-2', "'-2"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['\tcmd', "'\tcmd"],
    ['Smith, Jane', '"Smith, Jane"'],
    ['plain', 'plain'],
  ])('never lets %j run as a formula', (value, expected) => {
    expect(csvCell(value)).toBe(expected);
  });

  it('lists everyone with what happened, in plain words', () => {
    const csv = buildReport([
      person({}),
      person({
        rowNo: 3,
        to: ['nobody@example.com'],
        status: 'failed',
        errorCode: 'rejected:550',
        messageId: null,
      }),
      person({ rowNo: 4, to: ['=cmd@example.com'], status: 'skipped', errorCode: 'doNotEmail' }),
    ]);
    const lines = csv
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\r\n');
    expect(lines[0]).toBe('Row,To,Cc,Bcc,Status,Why,When,Message ID');
    expect(lines[1]).toBe('2,asha@example.com,,,Sent,,2026-09-25T10:00:00.000Z,<1@example.com>');
    expect(lines[2]).toBe(
      "3,nobody@example.com,,,Couldn't send,Their email provider refused it (the address may not exist) (550),,",
    );
    expect(lines[3]).toContain("'=cmd@example.com");
    expect(lines[3]).toContain('On the ""Do not email"" list');
    expect(csv.startsWith('\uFEFF')).toBe(true);
  });

  it('explains unknown reasons generically', () => {
    expect(reasonWords('something:odd')).toBe('Could not be sent (odd)');
    expect(reasonWords(null)).toBe('');
  });
});
