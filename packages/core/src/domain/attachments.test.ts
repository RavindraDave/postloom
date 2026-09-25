import { describe, expect, it } from 'vitest';
import { isSensitivePath } from './attachments';

describe('sensitive files', () => {
  it.each([
    '/home/asha/.ssh/id_rsa',
    'C:\\Users\\Asha\\.ssh\\config',
    '/home/asha/keys/server.pem',
    'D:\\certs\\me.pfx',
    '/Users/asha/Library/Keychains/login.keychain-db',
    '/home/asha/project/.env',
    '/home/asha/project/.env.production',
    'C:\\Users\\Asha\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Login Data',
    '/home/asha/.mozilla/firefox/abc.default/logins.json',
    '/home/asha/.aws/credentials',
    'id_ed25519',
  ])('blocks %s', (path) => {
    expect(isSensitivePath(path)).toBe(true);
  });

  it.each([
    '/home/asha/Invoices/INV-1001.pdf',
    'C:\\Users\\Asha\\Documents\\Price list 2026.xlsx',
    'invoices/keynote.pdf',
    '/home/asha/photos/environment.jpg',
    'monkey.png',
  ])('allows %s', (path) => {
    expect(isSensitivePath(path)).toBe(false);
  });
});
