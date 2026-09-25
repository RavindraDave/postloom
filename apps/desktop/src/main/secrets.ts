import { AppError } from '@postloom/core';

/**
 * How well stored passwords are protected on this computer:
 * - `keychain`: the OS keychain (macOS Keychain, Windows DPAPI, Linux libsecret/KWallet).
 * - `weak`: Linux without a keyring; Electron falls back to a fixed key, so
 *   the app warns and recommends not remembering the password.
 * - `unavailable`: encryption can't be used at all; passwords are not saved.
 */
export type SecretProtection = 'keychain' | 'weak' | 'unavailable';

export interface SecretVault {
  protection(): SecretProtection;
  encrypt(plainText: string): Uint8Array;
  decrypt(cipherText: Uint8Array): string;
}

/** The subset of Electron's safeStorage the vault uses (keeps it testable). */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
  getSelectedStorageBackend?: () => string;
  setUsePlainTextEncryption?: (usePlainText: boolean) => void;
}

/** Call after the app is ready (Linux only knows its keyring backend then). */
export function createSecretVault(
  storage: SafeStorageLike,
  platform: NodeJS.Platform,
): SecretVault {
  const noKeyring = platform === 'linux' && storage.getSelectedStorageBackend?.() === 'basic_text';
  // Without a keyring Electron refuses to encrypt unless told to use its
  // built-in key. Allow it, and report the protection as weak so the app warns.
  if (noKeyring) storage.setUsePlainTextEncryption?.(true);

  const protection = (): SecretProtection => {
    if (!storage.isEncryptionAvailable()) return 'unavailable';
    return noKeyring ? 'weak' : 'keychain';
  };

  return {
    protection,
    encrypt(plainText) {
      if (protection() === 'unavailable') {
        throw new AppError({ code: 'UNEXPECTED', messageKey: 'errors.secretsUnavailable' });
      }
      return new Uint8Array(storage.encryptString(plainText));
    },
    decrypt(cipherText) {
      try {
        return storage.decryptString(Buffer.from(cipherText));
      } catch (error) {
        // e.g. the database was copied from another computer or user account.
        throw new AppError(
          { code: 'EMAIL_AUTH_FAILED', messageKey: 'errors.passwordUnreadable' },
          { cause: error },
        );
      }
    },
  };
}
