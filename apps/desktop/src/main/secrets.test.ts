import { describe, expect, it } from 'vitest';
import { createSecretVault, type SafeStorageLike } from './secrets';

function fakeStorage(
  options: { available?: boolean; backend?: string; plainTextOptIn?: boolean } = {},
): SafeStorageLike {
  let plainText = false;
  return {
    isEncryptionAvailable: () =>
      (options.available ?? true) || (options.plainTextOptIn === true && plainText),
    setUsePlainTextEncryption: (value) => {
      plainText = value;
    },
    encryptString: (text) => Buffer.from(`enc:${text}`),
    decryptString: (buffer) => {
      const text = buffer.toString();
      if (!text.startsWith('enc:')) throw new Error('bad key');
      return text.slice(4);
    },
    getSelectedStorageBackend: () => options.backend ?? 'gnome_libsecret',
  };
}

describe('secret vault', () => {
  it('on a Mac, touches the Keychain only to save or use a password', () => {
    let keychainReads = 0;
    const storage = fakeStorage();
    const vault = createSecretVault(
      {
        ...storage,
        isEncryptionAvailable: () => {
          keychainReads += 1;
          return storage.isEncryptionAvailable();
        },
      },
      'darwin',
    );

    expect(vault.protection()).toBe('keychain');
    expect(keychainReads).toBe(0);
    expect(vault.decrypt(vault.encrypt('secret'))).toBe('secret');
  });

  it('on a Mac, says so plainly when the Keychain is refused', () => {
    const vault = createSecretVault(
      {
        ...fakeStorage(),
        encryptString: () => {
          throw new Error('User canceled');
        },
      },
      'darwin',
    );
    expect(() => vault.encrypt('x')).toThrow(
      expect.objectContaining({ messageKey: 'errors.secretsUnavailable' }),
    );
  });

  it('encrypts and decrypts through the OS keychain', () => {
    const vault = createSecretVault(fakeStorage(), 'darwin');
    const cipher = vault.encrypt('abcd efgh ijkl mnop');

    expect(Buffer.from(cipher).toString()).not.toBe('abcd efgh ijkl mnop');
    expect(vault.decrypt(cipher)).toBe('abcd efgh ijkl mnop');
    expect(vault.protection()).toBe('keychain');
  });

  it('reports weak protection on Linux without a keyring', () => {
    expect(createSecretVault(fakeStorage({ backend: 'basic_text' }), 'linux').protection()).toBe(
      'weak',
    );
    expect(createSecretVault(fakeStorage({ backend: 'basic_text' }), 'win32').protection()).toBe(
      'keychain',
    );
  });

  it('still saves passwords on Linux without a keyring, flagged as weak', () => {
    const vault = createSecretVault(
      fakeStorage({ available: false, backend: 'basic_text', plainTextOptIn: true }),
      'linux',
    );
    expect(vault.protection()).toBe('weak');
    expect(vault.decrypt(vault.encrypt('secret'))).toBe('secret');
  });

  it('refuses to store passwords when encryption is unavailable', () => {
    const vault = createSecretVault(fakeStorage({ available: false }), 'linux');
    expect(vault.protection()).toBe('unavailable');
    expect(() => vault.encrypt('x')).toThrow(expect.objectContaining({ code: 'UNEXPECTED' }));
  });

  it('explains when a saved password can no longer be read', () => {
    const vault = createSecretVault(fakeStorage(), 'win32');
    expect(() => vault.decrypt(new Uint8Array([1, 2, 3]))).toThrow(
      expect.objectContaining({
        code: 'EMAIL_AUTH_FAILED',
        messageKey: 'errors.passwordUnreadable',
      }),
    );
  });
});
