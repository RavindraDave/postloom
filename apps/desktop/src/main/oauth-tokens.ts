import { AppError, type EmailAccount } from '@postloom/core';
import type { Repositories } from '@postloom/db';
import { refreshTokens, type OAuthClient, type OAuthProvider, type OAuthTokens } from './oauth';
import type { SecretVault } from './secrets';

export interface AccessToken {
  accessToken: string;
  expiresAt: number;
}

/**
 * Access tokens for accounts that signed in with Google or Microsoft. The
 * refresh token is kept like a password (encrypted by the operating system);
 * access tokens live only in memory and are renewed a minute before they run
 * out, or at once when a provider refuses one.
 */
export interface AccountTokens {
  accessToken(account: EmailAccount, renew?: boolean): Promise<AccessToken>;
  /** Keeps the tokens from a sign-in (the refresh token is saved by the caller). */
  remember(accountId: string, tokens: AccessToken): void;
  forget(accountId: string): void;
  /** Providers this build can sign in with. */
  providers(): OAuthProvider[];
  client(provider: OAuthProvider): OAuthClient;
}

export function createAccountTokens({
  repos,
  vault,
  clients,
  now = Date.now,
}: {
  repos: Repositories;
  vault: SecretVault;
  clients: Partial<Record<OAuthProvider, OAuthClient>>;
  now?: () => number;
}): AccountTokens {
  const cache = new Map<string, AccessToken>();
  const renewing = new Map<string, Promise<AccessToken>>();

  const client = (provider: OAuthProvider): OAuthClient => {
    const found = clients[provider];
    if (!found) {
      throw new AppError({ code: 'EMAIL_AUTH_FAILED', messageKey: 'errors.signInUnavailable' });
    }
    return found;
  };

  const renew = async (account: EmailAccount): Promise<AccessToken> => {
    if (account.auth === 'password') {
      throw new AppError({ code: 'EMAIL_AUTH_FAILED', messageKey: 'errors.signInExpired' });
    }
    const cipher = await repos.accounts.getSecret(account.id);
    if (!cipher) {
      throw new AppError({ code: 'EMAIL_AUTH_FAILED', messageKey: 'errors.signInExpired' });
    }
    const fresh: OAuthTokens = await refreshTokens(
      client(account.auth),
      vault.decrypt(cipher),
      now(),
    );
    // Microsoft hands out a new refresh token each time; the old one soon stops working.
    if (fresh.refreshToken) {
      await repos.accounts.setSecret(account.id, vault.encrypt(fresh.refreshToken));
    }
    const token = { accessToken: fresh.accessToken, expiresAt: fresh.expiresAt };
    cache.set(account.id, token);
    return token;
  };

  return {
    async accessToken(account, force = false) {
      const cached = cache.get(account.id);
      if (!force && cached && cached.expiresAt - 60_000 > now()) return cached;
      // One renewal at a time per account, however many ask.
      const pending = renewing.get(account.id);
      if (pending) return pending;
      const work = renew(account).finally(() => renewing.delete(account.id));
      renewing.set(account.id, work);
      return work;
    },
    remember(accountId, tokens) {
      cache.set(accountId, tokens);
    },
    forget(accountId) {
      cache.delete(accountId);
    },
    providers: () => (Object.keys(clients) as OAuthProvider[]).filter((key) => clients[key]),
    client,
  };
}
