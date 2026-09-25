import type { SecretVault } from './secrets';

/** A reversible stand-in for the OS keychain, for tests only. */
export function fakeVault(
  protection: ReturnType<SecretVault['protection']> = 'keychain',
): SecretVault {
  return {
    protection: () => protection,
    encrypt: (text) => new TextEncoder().encode(`sealed:${text}`),
    decrypt: (cipher) => new TextDecoder().decode(cipher).replace(/^sealed:/, ''),
  };
}
