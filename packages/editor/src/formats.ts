import { z } from 'zod';

/**
 * How a personal detail is shown in the email. Spreadsheets give Postloom the
 * raw value (a date as 2026-10-01, an amount as 12400), so a template can say
 * how each detail should look. Unset, the value appears as it is in the list.
 */
export const detailFormatSchema = z.enum([
  'date-long',
  'date-short',
  'date-weekday',
  'date-dmy',
  'date-mdy',
  'number',
  'number-2',
  'number-in',
  'money-inr',
  'money-inr-0',
  'money-usd',
  'money-eur',
  'money-gbp',
]);
export type DetailFormat = z.infer<typeof detailFormatSchema>;

/** The formats in the order they're offered, with an example of each. */
export const DETAIL_FORMATS: { id: DetailFormat; kind: 'date' | 'number' | 'money' }[] = [
  { id: 'date-long', kind: 'date' },
  { id: 'date-short', kind: 'date' },
  { id: 'date-weekday', kind: 'date' },
  { id: 'date-dmy', kind: 'date' },
  { id: 'date-mdy', kind: 'date' },
  { id: 'number', kind: 'number' },
  { id: 'number-2', kind: 'number' },
  { id: 'number-in', kind: 'number' },
  { id: 'money-inr', kind: 'money' },
  { id: 'money-inr-0', kind: 'money' },
  { id: 'money-usd', kind: 'money' },
  { id: 'money-eur', kind: 'money' },
  { id: 'money-gbp', kind: 'money' },
];

/** Excel counts days from 30 December 1899; its dates fall in this range. */
const EXCEL_SERIAL = { min: 20_000, max: 80_000 } as const;

/**
 * Reads a date the ways a spreadsheet gives it: 2026-10-01 (what Postloom
 * reads from Excel), 01/10/2026 or 1-10-2026 (day first, unless the numbers
 * say otherwise), or an Excel day number. Null when it isn't a date.
 */
export function parseDate(value: string): Date | null {
  const text = value.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(text);
  if (iso) return makeDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const parts = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(text);
  if (parts) {
    const first = Number(parts[1]);
    const second = Number(parts[2]);
    const rawYear = Number(parts[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    // Day first (India, UK, most of the world), unless only month-first can be right.
    return first <= 12 && second > 12
      ? makeDate(year, first, second)
      : makeDate(year, second, first);
  }

  if (/^\d{5}(\.\d+)?$/.test(text)) {
    const serial = Math.floor(Number(text));
    if (serial >= EXCEL_SERIAL.min && serial <= EXCEL_SERIAL.max) {
      return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
    }
  }
  return null;
}

function makeDate(year: number, month: number, day: number): Date | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : null;
}

/**
 * Reads an amount: "12400", "12,400.50", "₹ 1,24,000", "$1,200", "(250)".
 * Null when it isn't a number.
 */
export function parseAmount(value: string): number | null {
  let text = value.trim();
  const negative = /^\(.*\)$/.test(text) || text.startsWith('-');
  text = text.replace(/[()\s,₹$€£]|Rs\.?|INR|USD|EUR|GBP/gi, '').replace(/^-/, '');
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const amount = Number(text);
  return negative ? -amount : amount;
}

const dateStyle: Record<string, Intl.DateTimeFormatOptions> = {
  'date-long': { day: 'numeric', month: 'long', year: 'numeric' },
  'date-short': { day: 'numeric', month: 'short', year: 'numeric' },
  'date-weekday': { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
};

const two = (n: number) => String(n).padStart(2, '0');

/**
 * A detail's value in its format. Values that don't fit the format (a word
 * where a date was expected) are left exactly as they are.
 */
export function formatDetail(value: string, format: DetailFormat | undefined): string {
  if (!format || value.trim() === '') return value;

  if (format.startsWith('date-')) {
    const date = parseDate(value);
    if (!date) return value;
    if (format === 'date-dmy') {
      return `${two(date.getUTCDate())}/${two(date.getUTCMonth() + 1)}/${String(date.getUTCFullYear())}`;
    }
    if (format === 'date-mdy') {
      return `${two(date.getUTCMonth() + 1)}/${two(date.getUTCDate())}/${String(date.getUTCFullYear())}`;
    }
    return new Intl.DateTimeFormat('en-GB', { ...dateStyle[format], timeZone: 'UTC' }).format(date);
  }

  const amount = parseAmount(value);
  if (amount === null) return value;
  switch (format) {
    case 'number':
      return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(amount);
    case 'number-2':
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    case 'number-in':
      return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(amount);
    case 'money-inr':
      return money('en-IN', 'INR', amount, 2);
    case 'money-inr-0':
      return money('en-IN', 'INR', amount, 0);
    case 'money-usd':
      return money('en-US', 'USD', amount, 2);
    case 'money-eur':
      return money('en-IE', 'EUR', amount, 2);
    case 'money-gbp':
      return money('en-GB', 'GBP', amount, 2);
    default:
      return value;
  }
}

function money(locale: string, currency: string, amount: number, digits: number): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount);
}

/** Every detail of one person, each in its template's format. */
export function formatValues(
  values: Record<string, string>,
  formats: Partial<Record<string, DetailFormat>> | undefined,
): Record<string, string> {
  if (!formats) return values;
  const formatted: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [name, value] of Object.entries(values)) {
    formatted[name] = formatDetail(value, formats[name]);
  }
  return formatted;
}
