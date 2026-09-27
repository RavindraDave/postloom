import { describe, expect, it } from 'vitest';
import { formatDetail, formatValues, parseAmount, parseDate } from './formats';

describe('dates', () => {
  it('reads the dates spreadsheets give', () => {
    expect(parseDate('2026-10-01')?.toISOString().slice(0, 10)).toBe('2026-10-01');
    expect(parseDate('01/10/2026')?.toISOString().slice(0, 10)).toBe('2026-10-01');
    expect(parseDate('1-10-26')?.toISOString().slice(0, 10)).toBe('2026-10-01');
    // Only month-first can be right here.
    expect(parseDate('10/25/2026')?.toISOString().slice(0, 10)).toBe('2026-10-25');
    // An Excel day number.
    expect(parseDate('46296')?.toISOString().slice(0, 10)).toBe('2026-10-01');
    expect(parseDate('31/02/2026')).toBeNull();
    expect(parseDate('next week')).toBeNull();
  });

  it('shows dates the way the template asks', () => {
    expect(formatDetail('2026-10-01', 'date-long')).toBe('1 October 2026');
    expect(formatDetail('2026-10-01', 'date-short')).toBe('1 Oct 2026');
    expect(formatDetail('2026-10-01', 'date-weekday')).toBe('Thursday, 1 October 2026');
    expect(formatDetail('2026-10-01', 'date-dmy')).toBe('01/10/2026');
    expect(formatDetail('2026-10-01', 'date-mdy')).toBe('10/01/2026');
  });
});

describe('amounts', () => {
  it('reads amounts with symbols, commas and brackets', () => {
    expect(parseAmount('12400')).toBe(12400);
    expect(parseAmount('₹ 1,24,000.50')).toBe(124000.5);
    expect(parseAmount('Rs. 950')).toBe(950);
    expect(parseAmount('(250)')).toBe(-250);
    expect(parseAmount('about 12')).toBeNull();
  });

  it('shows numbers and money the way the template asks', () => {
    expect(formatDetail('124000', 'number')).toBe('124,000');
    expect(formatDetail('124000', 'number-2')).toBe('124,000.00');
    expect(formatDetail('124000', 'number-in')).toBe('1,24,000');
    expect(formatDetail('124000', 'money-inr')).toBe('₹1,24,000.00');
    expect(formatDetail('124000', 'money-inr-0')).toBe('₹1,24,000');
    expect(formatDetail('1200.5', 'money-usd')).toBe('$1,200.50');
    expect(formatDetail('1200.5', 'money-gbp')).toBe('£1,200.50');
    expect(formatDetail('1200.5', 'money-eur')).toBe('€1,200.50');
  });
});

describe('formatDetail', () => {
  it('leaves values that do not fit the format as they are', () => {
    expect(formatDetail('To be confirmed', 'date-long')).toBe('To be confirmed');
    expect(formatDetail('Waived', 'money-inr')).toBe('Waived');
    expect(formatDetail('', 'money-inr')).toBe('');
    expect(formatDetail('2026-10-01', undefined)).toBe('2026-10-01');
  });

  it('formats only the details that have a format', () => {
    expect(
      formatValues(
        { 'Due Date': '2026-10-01', Amount: '12400', 'First Name': 'Rahul' },
        { 'Due Date': 'date-long', Amount: 'money-inr-0' },
      ),
    ).toEqual({ 'Due Date': '1 October 2026', Amount: '₹12,400', 'First Name': 'Rahul' });
  });
});
