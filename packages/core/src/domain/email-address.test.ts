import { describe, expect, it } from 'vitest';
import { isPlausibleEmail, normaliseEmail } from './email-address';

describe('isPlausibleEmail', () => {
  it.each([
    'rahul.mehta@example.com',
    'priya+invoices@example.co.in',
    "o'brien@example.ie",
    ' asha@example.com ',
  ])('accepts %s', (address) => {
    expect(isPlausibleEmail(address)).toBe(true);
  });

  it.each([
    '',
    'meera@@example.in',
    'no-at-sign.example.com',
    '@example.com',
    'asha@',
    'asha@localhost',
    'asha@example.c',
    'asha @example.com',
    'asha..k@example.com',
    '.asha@example.com',
    'asha.@example.com',
    'asha@-example.com',
    'asha@example..com',
    `${'a'.repeat(65)}@example.com`,
    `a@${'b'.repeat(250)}.com`,
  ])('rejects %j', (address) => {
    expect(isPlausibleEmail(address)).toBe(false);
  });
});

describe('normaliseEmail', () => {
  it('trims and lower-cases', () => {
    expect(normaliseEmail('  Rahul.Mehta@Example.COM ')).toBe('rahul.mehta@example.com');
  });
});
