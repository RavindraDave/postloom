import { AppError } from '@postloom/core';
import Papa from 'papaparse';
import readXlsxFile from 'read-excel-file/node';

/** One sheet of a spreadsheet: every cell as text, exactly as people see it. */
export interface SheetTable {
  name: string;
  rows: string[][];
}

/** Spreadsheets larger than this are refused before reading. */
export const MAX_SPREADSHEET_BYTES = 25 * 1024 * 1024;
/** More rows than this can't be sent in one go (and would freeze a preview). */
export const MAX_ROWS = 20_000;

/**
 * Reads an Excel (.xlsx) or CSV file into sheets of text cells. Numbers keep
 * the digits people typed (no 1.1000000001, leading zeros stay), and dates
 * become YYYY-MM-DD.
 */
export async function readSpreadsheet(bytes: Uint8Array, fileName: string): Promise<SheetTable[]> {
  if (bytes.byteLength > MAX_SPREADSHEET_BYTES) {
    throw new AppError({ code: 'VALIDATION_FAILED', messageKey: 'errors.spreadsheetTooBig' });
  }
  const kind = spreadsheetKind(bytes, fileName);
  if (kind === 'xls') {
    throw new AppError({ code: 'VALIDATION_FAILED', messageKey: 'errors.spreadsheetOldExcel' });
  }
  if (kind === 'xlsx') return readXlsx(bytes);
  if (kind === 'csv') return [{ name: sheetNameFor(fileName), rows: readCsv(bytes) }];
  throw new AppError({ code: 'VALIDATION_FAILED', messageKey: 'errors.spreadsheetType' });
}

function spreadsheetKind(bytes: Uint8Array, fileName: string): 'xlsx' | 'xls' | 'csv' | null {
  // .xlsx files are zip archives: "PK\x03\x04".
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return 'xlsx';
  }
  // Old binary .xls starts with the OLE signature; it isn't supported, but
  // it is common enough to say exactly how to fix it.
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) return 'xls';
  return /\.(csv|txt|tsv)$/i.test(fileName) ? 'csv' : null;
}

async function readXlsx(bytes: Uint8Array): Promise<SheetTable[]> {
  try {
    const sheets = await readXlsxFile(Buffer.from(bytes), { parseNumber: (text) => text });
    return sheets.map((sheet) => ({
      name: sheet.sheet,
      rows: limitRows(sheet.data.map((row) => row.map(cellText))),
    }));
  } catch (error) {
    throw new AppError(
      { code: 'VALIDATION_FAILED', messageKey: 'errors.spreadsheetUnreadable' },
      { cause: error },
    );
  }
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  return '';
}

function readCsv(bytes: Uint8Array): string[][] {
  const text = decodeText(bytes);
  const result = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' });
  return limitRows(result.data.map((row) => row.map((cell) => cell.trim())));
}

/** CSV files come as UTF-8 (with or without BOM) or UTF-16 from Excel's "Unicode text". */
function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  return utf8.startsWith('﻿') ? utf8.slice(1) : utf8;
}

function limitRows(rows: string[][]): string[][] {
  if (rows.length > MAX_ROWS + 50) {
    throw new AppError({
      code: 'VALIDATION_FAILED',
      messageKey: 'errors.spreadsheetTooManyRows',
      details: { max: MAX_ROWS },
    });
  }
  return rows;
}

function sheetNameFor(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '') || 'Sheet 1';
}
