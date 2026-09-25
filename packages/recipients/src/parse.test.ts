import { describe, expect, it } from 'vitest';
import { readSpreadsheet } from './parse';
import { makeXlsx } from './test-helpers';

const utf8 = (text: string) => new TextEncoder().encode(text);

describe('reading spreadsheets', () => {
  it('reads every sheet of an Excel file, keeping numbers as typed', async () => {
    const sheets = await readSpreadsheet(
      makeXlsx([
        {
          name: 'Clients',
          rows: [
            ['Email', 'First Name', 'Amount'],
            ['rahul@example.com', 'Rahul', 1.1],
          ],
        },
        { name: 'Notes', rows: [['Anything']] },
      ]),
      'clients.xlsx',
    );
    expect(sheets.map((sheet) => sheet.name)).toEqual(['Clients', 'Notes']);
    expect(sheets[0]?.rows).toEqual([
      ['Email', 'First Name', 'Amount'],
      ['rahul@example.com', 'Rahul', '1.1'],
    ]);
  });

  it('reads CSV with commas, semicolons or tabs, and quoted cells', async () => {
    for (const separator of [',', ';', '\t']) {
      const sheets = await readSpreadsheet(
        utf8(
          ['Email,Name', 'a@example.com,"Doe, Jane"'].join('\n').replace(/,(?=[^ ])/g, separator),
        ),
        'list.csv',
      );
      expect(sheets[0]?.rows[0]).toEqual(['Email', 'Name']);
    }
    const quoted = await readSpreadsheet(
      utf8('Email,Name\na@example.com,"Doe, Jane"\n'),
      'list.csv',
    );
    expect(quoted[0]?.rows[1]).toEqual(['a@example.com', 'Doe, Jane']);
    expect(quoted[0]?.name).toBe('list');
  });

  it('understands UTF-8 with a BOM and UTF-16 from Excel', async () => {
    const bom = await readSpreadsheet(utf8('﻿Name,Email\nZoë,z@example.com'), 'a.csv');
    expect(bom[0]?.rows[0]).toEqual(['Name', 'Email']);
    const text = 'Name\tEmail\nRāhul\tr@example.com';
    const utf16 = new Uint8Array(2 + text.length * 2);
    utf16.set([0xff, 0xfe]);
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      utf16[2 + i * 2] = code & 0xff;
      utf16[3 + i * 2] = code >> 8;
    }
    const sheets = await readSpreadsheet(utf16, 'b.txt');
    expect(sheets[0]?.rows[1]).toEqual(['Rāhul', 'r@example.com']);
  });

  it('refuses old .xls files, other files and damaged workbooks', async () => {
    await expect(
      readSpreadsheet(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]), 'old.xls'),
    ).rejects.toMatchObject({
      messageKey: 'errors.spreadsheetType',
    });
    await expect(readSpreadsheet(utf8('%PDF-1.7'), 'file.pdf')).rejects.toMatchObject({
      messageKey: 'errors.spreadsheetType',
    });
    await expect(
      readSpreadsheet(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), 'broken.xlsx'),
    ).rejects.toMatchObject({ messageKey: 'errors.spreadsheetUnreadable' });
  });

  it('refuses spreadsheets with too many rows', async () => {
    const rows = [
      'Email',
      ...Array.from({ length: 20_100 }, (_, i) => `p${String(i)}@example.com`),
    ];
    await expect(readSpreadsheet(utf8(rows.join('\n')), 'big.csv')).rejects.toMatchObject({
      messageKey: 'errors.spreadsheetTooManyRows',
    });
  });
});
