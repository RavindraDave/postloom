/**
 * Attachments on one email may add up to this much. Providers limit a whole
 * email to about 25 MB, and attachments grow by a third when encoded.
 */
export const MAX_ATTACHMENT_BYTES = 18 * 1024 * 1024;

/**
 * Files that must never be attached, whatever the spreadsheet says: keys,
 * passwords and browser or keychain data (PLAN.md §10.4). Checked against
 * the path as typed and the real path (after following shortcuts).
 */
const SENSITIVE_PATHS: RegExp[] = [
  // Folders of keys and credentials.
  /(^|[\\/])\.(ssh|gnupg|aws|azure|kube|docker)([\\/]|$)/i,
  /(^|[\\/])Keychains([\\/]|$)/i,
  // Key and credential files.
  /\.(pem|key|p12|pfx|ppk|kdbx|keychain|keychain-db|gpg|asc|jks|keystore)$/i,
  /(^|[\\/])id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /(^|[\\/])(\.env(\.[^\\/]*)?|\.netrc|\.npmrc|\.pypirc|\.git-credentials|credentials(\.json)?)$/i,
  // Browser profiles: saved passwords and cookies.
  /(^|[\\/])(Login Data|Cookies|Web Data|key[34]\.db|logins\.json|cookies\.sqlite)$/i,
];

export function isSensitivePath(path: string): boolean {
  return SENSITIVE_PATHS.some((pattern) => pattern.test(path));
}
