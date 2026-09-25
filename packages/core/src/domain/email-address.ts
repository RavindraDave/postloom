/**
 * A deliberately simple, predictable check for addresses people type or paste.
 * It catches the everyday mistakes (missing @, spaces, "@@", no dot in the
 * domain) without trying to implement the whole RFC. The sending engine does
 * a stricter parse before anything is sent.
 */
const LOCAL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/;
const LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

export function isPlausibleEmail(value: string): boolean {
  const address = value.trim();
  if (address.length > 254 || /\s/.test(address)) return false;
  const at = address.lastIndexOf('@');
  if (at <= 0 || at !== address.indexOf('@')) return false;
  const local = address.slice(0, at);
  const domain = address.slice(at + 1);
  if (local.length > 64 || !LOCAL.test(local) || local.startsWith('.') || local.endsWith('.')) {
    return false;
  }
  if (local.includes('..')) return false;
  const labels = domain.split('.');
  if (labels.length < 2) return false;
  const tld = labels[labels.length - 1] ?? '';
  return labels.every((label) => LABEL.test(label)) && /^[A-Za-z]{2,}$/.test(tld);
}

/** Lower-cases and trims an address for comparisons (e.g. the "Do not email" list). */
export function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}
