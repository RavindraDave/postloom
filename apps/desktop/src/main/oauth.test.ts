import { createRepositories, openDatabase, type OpenedDatabase } from '@postloom/db';
import type { SmtpAccountConfig } from '@postloom/email';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startFakeOAuth, type FakeOAuthServer } from '../../e2e/oauth-server';
import { createAccountHandlers, loadSmtpConfig } from './accounts';
import { emailFromIdToken, oauthClients, refreshTokens, signIn } from './oauth';
import { createAccountTokens } from './oauth-tokens';
import { fakeVault } from './test-fakes';

let fake: FakeOAuthServer;
let opened: OpenedDatabase;
let repos: ReturnType<typeof createRepositories>;

/** "The browser": follows the provider's redirect back to Postloom's loopback address. */
const browser = async (url: string) => {
  const answer = await fetch(url, { redirect: 'manual' });
  const next = answer.headers.get('location');
  if (next) await fetch(next);
};

const clientsFor = (base: string) =>
  oauthClients({
    testBase: base,
    googleClientId: 'test-google-client',
    googleClientSecret: 'test-google-secret',
    microsoftClientId: 'test-microsoft-client',
  });

beforeEach(async () => {
  fake = await startFakeOAuth();
  opened = await openDatabase({ file: ':memory:' });
  repos = createRepositories(opened.db);
});
afterEach(async () => {
  await fake.close();
  await opened.close();
});

describe('signing in with Google or Microsoft', () => {
  it('offers only the providers this build has app ids for', () => {
    expect(Object.keys(oauthClients({}))).toEqual([]);
    expect(Object.keys(oauthClients({ microsoftClientId: 'x' }))).toEqual(['microsoft']);
    const google = oauthClients({ googleClientId: 'g' }).google;
    // Send-only permission: no reading of anyone's email.
    expect(google?.scopes).toEqual([
      'openid',
      'email',
      'https://www.googleapis.com/auth/gmail.send',
    ]);
    expect(google?.authorizeUrl).toBe('https://accounts.google.com/o/oauth2/v2/auth');
  });

  it('signs in through the browser with PKCE and gets the address', async () => {
    const clients = clientsFor(fake.base);
    const opened: string[] = [];
    const google = await signIn(clients.google!, {
      openBrowser: async (url) => {
        opened.push(url);
        await browser(url);
      },
    });
    expect(google.email).toBe('asha@gmail.example');
    expect(google.refreshToken).toMatch(/^google-refresh/);
    const url = new URL(opened[0] ?? '');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri')).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(url.searchParams.get('access_type')).toBe('offline');

    const microsoft = await signIn(clients.microsoft!, { openBrowser: browser });
    // Microsoft personal accounts: the address comes from the sign-in name.
    expect(microsoft.email).toBe('asha@outlook.example');
  });

  it('says so when the person says no, gives up, or cancels', async () => {
    const clients = clientsFor(fake.base);
    fake.denyNext = true;
    await expect(signIn(clients.google!, { openBrowser: browser })).rejects.toMatchObject({
      messageKey: 'errors.signInCancelled',
    });
    await expect(
      signIn(clients.google!, { openBrowser: () => Promise.resolve(), timeoutMs: 50 }),
    ).rejects.toMatchObject({ messageKey: 'errors.signInTimedOut' });
    const controller = new AbortController();
    const waiting = signIn(clients.google!, {
      openBrowser: () => Promise.resolve(),
      signal: controller.signal,
    });
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ messageKey: 'errors.signInCancelled' });
  });

  it('ignores a browser request that did not come from this sign-in', async () => {
    const clients = clientsFor(fake.base);
    const result = signIn(clients.google!, {
      openBrowser: async (url) => {
        const redirect = new URL(url).searchParams.get('redirect_uri') ?? '';
        // Someone else's code, without our state: refused and ignored.
        const forged = await fetch(`${redirect}?code=stolen&state=wrong`);
        expect(forged.status).toBe(400);
        await browser(url);
      },
    });
    await expect(result).resolves.toMatchObject({ email: 'asha@gmail.example' });
  });

  it('renews access, and asks to sign in again once access is removed', async () => {
    const clients = clientsFor(fake.base);
    const first = await signIn(clients.microsoft!, { openBrowser: browser });
    const renewed = await refreshTokens(clients.microsoft!, first.refreshToken);
    expect(renewed.accessToken).not.toBe(first.accessToken);
    // Microsoft rotated the refresh token; the old one is gone.
    expect(renewed.refreshToken).toBeDefined();
    await expect(refreshTokens(clients.microsoft!, first.refreshToken)).rejects.toMatchObject({
      messageKey: 'errors.signInExpired',
    });
  });

  it('only trusts an ID token made for Postloom', () => {
    const token = (claims: object) =>
      `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.y`;
    expect(emailFromIdToken(token({ aud: 'me', email: 'A@X.com' }), 'me')).toBe('a@x.com');
    expect(() => emailFromIdToken(token({ aud: 'other', email: 'a@x.com' }), 'me')).toThrow();
    expect(() => emailFromIdToken(token({ aud: 'me' }), 'me')).toThrow();
    expect(() => emailFromIdToken('not a token', 'me')).toThrow();
    expect(() => emailFromIdToken(undefined, 'me')).toThrow();
  });
});

describe('accounts that sign in with Google or Microsoft', () => {
  const setUp = () => {
    const vault = fakeVault();
    const clients = clientsFor(fake.base);
    const tokens = createAccountTokens({ repos, vault, clients });
    const verify = vi.fn<(config: SmtpAccountConfig) => Promise<void>>(() => Promise.resolve());
    const oauth = { openBrowser: browser, gmailApiBase: fake.base };
    const handlers = createAccountHandlers({
      repos,
      vault,
      tokens,
      oauth,
      smtp: { verify, send: vi.fn() },
    });
    return { vault, tokens, verify, handlers, oauth };
  };

  it('saves a Google account after signing in, keeping only the refresh token', async () => {
    const { handlers, vault } = setUp();
    expect(await handlers['accounts:signInProviders'](undefined)).toEqual(['google', 'microsoft']);
    const account = await handlers['accounts:signIn']({ provider: 'google' });
    expect(account).toMatchObject({
      auth: 'google',
      provider: 'gmail',
      username: 'asha@gmail.example',
      name: 'asha@gmail.example',
      lastTestOk: true,
    });
    const secret = await repos.accounts.getSecret(account.id);
    expect(vault.decrypt(secret!)).toMatch(/^google-refresh/);
  });

  it('checks a Microsoft account can send before saving it', async () => {
    const { handlers, verify } = setUp();
    const account = await handlers['accounts:signIn']({ provider: 'microsoft', name: 'Work' });
    expect(account).toMatchObject({ auth: 'microsoft', provider: 'outlook', name: 'Work' });
    const config = verify.mock.calls[0]?.[0];
    expect(config).toMatchObject({
      host: 'smtp-mail.outlook.com',
      username: 'asha@outlook.example',
      via: 'smtp',
    });
    expect(config?.oauth?.accessToken).toMatch(/microsoft-access/);
  });

  it('signs a saved account in again, but only as the same address', async () => {
    const { handlers } = setUp();
    const first = await handlers['accounts:signIn']({ provider: 'google' });
    const again = await handlers['accounts:signIn']({ provider: 'google', accountId: first.id });
    expect(again.id).toBe(first.id);
    expect(await handlers['accounts:list'](undefined)).toHaveLength(1);

    fake.emails.google = 'someone-else@gmail.example';
    await expect(
      handlers['accounts:signIn']({ provider: 'google', accountId: first.id }),
    ).rejects.toMatchObject({ messageKey: 'errors.signInOtherAddress' });
  });

  it('sends Google accounts through the Gmail API with a fresh token', async () => {
    const { handlers, tokens, oauth, vault } = setUp();
    const saved = await handlers['accounts:signIn']({ provider: 'google' });
    const account = await repos.accounts.get(saved.id);
    tokens.forget(account.id);
    const config = await loadSmtpConfig(account, { repos, vault, tokens, oauth });
    expect(config).toMatchObject({ via: 'gmail-api', password: '', gmailApiBase: fake.base });
    expect(fake.validAccessTokens.has(config.oauth!.accessToken)).toBe(true);
  });

  it('keeps Microsoft’s new refresh token each time, and asks to sign in again when access is removed', async () => {
    const { handlers, tokens, vault } = setUp();
    const saved = await handlers['accounts:signIn']({ provider: 'microsoft' });
    const account = await repos.accounts.get(saved.id);
    const before = vault.decrypt((await repos.accounts.getSecret(account.id))!);
    await tokens.accessToken(account, true);
    const after = vault.decrypt((await repos.accounts.getSecret(account.id))!);
    expect(after).not.toBe(before);

    fake.validRefreshTokens.clear();
    await expect(tokens.accessToken(account, true)).rejects.toMatchObject({
      messageKey: 'errors.signInExpired',
    });
  });

  it('renews once for many callers at the same moment', async () => {
    const { handlers, tokens } = setUp();
    const saved = await handlers['accounts:signIn']({ provider: 'google' });
    const account = await repos.accounts.get(saved.id);
    const [a, b] = await Promise.all([
      tokens.accessToken(account, true),
      tokens.accessToken(account, true),
    ]);
    expect(a.accessToken).toBe(b.accessToken);
  });

  it('stops a sign-in the person gave up on', async () => {
    const { handlers } = setUp();
    const vault = fakeVault();
    const stuck = createAccountHandlers({
      repos,
      vault,
      tokens: createAccountTokens({ repos, vault, clients: clientsFor(fake.base) }),
      oauth: { openBrowser: () => Promise.resolve() },
    });
    const waiting = stuck['accounts:signIn']({ provider: 'google' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await stuck['accounts:signInCancel'](undefined);
    await expect(waiting).rejects.toMatchObject({ messageKey: 'errors.signInCancelled' });
    expect(await handlers['accounts:list'](undefined)).toEqual([]);
  });

  it('offers no sign-in in a build without app ids', async () => {
    const vault = fakeVault();
    const handlers = createAccountHandlers({
      repos,
      vault,
      tokens: createAccountTokens({ repos, vault, clients: {} }),
      oauth: { openBrowser: browser },
    });
    expect(await handlers['accounts:signInProviders'](undefined)).toEqual([]);
    await expect(handlers['accounts:signIn']({ provider: 'google' })).rejects.toMatchObject({
      messageKey: 'errors.signInUnavailable',
    });
  });
});
