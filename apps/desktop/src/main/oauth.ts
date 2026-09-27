import { AppError } from '@postloom/core';
import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Signing in with Google or Microsoft (OAuth 2.0 for desktop apps, RFC 8252):
 * the person signs in in their own web browser, which then comes back to a
 * one-off address on this computer (127.0.0.1) with a code. The code is only
 * useful with the secret half of a PKCE pair that never leaves this process.
 *
 * Postloom asks for as little as it can:
 * - Google: `gmail.send` (send email, nothing else) plus the address.
 * - Microsoft: `SMTP.Send` plus the address, and `offline_access` so a send
 *   can carry on after the first hour.
 */

export type OAuthProvider = 'google' | 'microsoft';

export interface OAuthClient {
  provider: OAuthProvider;
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  /** Google's desktop clients have one (it isn't secret); Microsoft's public clients don't. */
  clientSecret?: string | undefined;
  scopes: string[];
  /** Microsoft only lets "localhost" (any port) back in; Google prefers 127.0.0.1. */
  redirectHost: 'localhost' | '127.0.0.1';
  extraParams: Record<string, string>;
}

export interface OAuthTokens {
  accessToken: string;
  /** When the access token stops working (ms since 1970). */
  expiresAt: number;
  /** Returned at sign-in, and sometimes again when renewed (Microsoft rotates them). */
  refreshToken?: string | undefined;
}

export interface SignedIn extends OAuthTokens {
  refreshToken: string;
  /** The address the person signed in as. */
  email: string;
}

/** Client ids, from the build (or from tests); a provider without one isn't offered. */
export interface OAuthSettings {
  googleClientId?: string | undefined;
  googleClientSecret?: string | undefined;
  microsoftClientId?: string | undefined;
  /** Tests only: a fake identity provider serving /<provider>/authorize and /<provider>/token. */
  testBase?: string | undefined;
}

export function oauthClients(settings: OAuthSettings): Partial<Record<OAuthProvider, OAuthClient>> {
  const at = (provider: OAuthProvider, real: { authorize: string; token: string }) =>
    settings.testBase
      ? {
          authorizeUrl: `${settings.testBase}/${provider}/authorize`,
          tokenUrl: `${settings.testBase}/${provider}/token`,
        }
      : { authorizeUrl: real.authorize, tokenUrl: real.token };
  const clients: Partial<Record<OAuthProvider, OAuthClient>> = {};
  if (settings.googleClientId) {
    clients.google = {
      provider: 'google',
      ...at('google', {
        authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
        token: 'https://oauth2.googleapis.com/token',
      }),
      clientId: settings.googleClientId,
      clientSecret: settings.googleClientSecret,
      scopes: ['openid', 'email', 'https://www.googleapis.com/auth/gmail.send'],
      redirectHost: '127.0.0.1',
      // A refresh token every time, so a new sign-in always works for long sends.
      extraParams: { access_type: 'offline', prompt: 'consent' },
    };
  }
  if (settings.microsoftClientId) {
    clients.microsoft = {
      provider: 'microsoft',
      ...at('microsoft', {
        authorize: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      }),
      clientId: settings.microsoftClientId,
      scopes: ['openid', 'email', 'offline_access', 'https://outlook.office.com/SMTP.Send'],
      redirectHost: 'localhost',
      extraParams: { prompt: 'select_account' },
    };
  }
  return clients;
}

const base64url = (bytes: Buffer) => bytes.toString('base64url');

const fail = (
  code: 'EMAIL_AUTH_FAILED' | 'EMAIL_CONNECTION_FAILED' | 'VALIDATION_FAILED',
  key: string,
) => new AppError({ code, messageKey: key });

/** The address in an ID token that came straight from the token endpoint (over TLS). */
export function emailFromIdToken(idToken: unknown, clientId: string): string {
  if (typeof idToken !== 'string') throw fail('EMAIL_AUTH_FAILED', 'errors.signInFailed');
  const payload = idToken.split('.')[1] ?? '';
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
  } catch {
    throw fail('EMAIL_AUTH_FAILED', 'errors.signInFailed');
  }
  const audience = claims['aud'];
  const forUs = Array.isArray(audience) ? audience.includes(clientId) : audience === clientId;
  // Microsoft personal accounts may leave out "email"; the sign-in name is the address.
  const email = claims['email'] ?? claims['preferred_username'];
  if (!forUs || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+$/.test(email)) {
    throw fail('EMAIL_AUTH_FAILED', 'errors.signInFailed');
  }
  return email.toLowerCase();
}

async function postToken(client: OAuthClient, fields: Record<string, string>): Promise<Response> {
  const body = new URLSearchParams({
    client_id: client.clientId,
    ...(client.clientSecret ? { client_secret: client.clientSecret } : {}),
    ...fields,
  });
  try {
    return await fetch(client.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body,
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw fail('EMAIL_CONNECTION_FAILED', 'errors.signInOffline');
  }
}

function tokensFrom(json: Record<string, unknown>, now: number): OAuthTokens {
  const accessToken = json['access_token'];
  const expiresIn = Number(json['expires_in'] ?? 3600);
  if (typeof accessToken !== 'string' || !accessToken) {
    throw fail('EMAIL_AUTH_FAILED', 'errors.signInFailed');
  }
  const refreshToken = json['refresh_token'];
  return {
    accessToken,
    expiresAt: now + (Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000,
    ...(typeof refreshToken === 'string' && refreshToken ? { refreshToken } : {}),
  };
}

/** A fresh access token from a saved refresh token. */
export async function refreshTokens(
  client: OAuthClient,
  refreshToken: string,
  now = Date.now(),
): Promise<OAuthTokens> {
  const response = await postToken(client, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: client.scopes.join(' '),
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    // Signed out, password changed or access removed: the person must sign in again.
    if (json['error'] === 'invalid_grant' || response.status === 400 || response.status === 401) {
      throw fail('EMAIL_AUTH_FAILED', 'errors.signInExpired');
    }
    throw fail('EMAIL_CONNECTION_FAILED', 'errors.signInOffline');
  }
  return tokensFrom(json, now);
}

const PAGE = (title: string, body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>` +
  '<style>body{font:16px/1.5 system-ui,sans-serif;color:#1d1d1f;background:#f6f4ef;' +
  'display:grid;place-items:center;min-height:90vh;margin:0}main{max-width:28rem;padding:2rem;' +
  'background:#fff;border-radius:16px;box-shadow:0 1px 3px #0002}h1{font-size:1.3rem;margin:0 0 .5rem}</style>' +
  `</head><body><main><h1>${title}</h1><p>${body}</p></main></body></html>`;

function answer(response: ServerResponse, status: number, title: string, body: string) {
  response.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    'Cache-Control': 'no-store',
  });
  response.end(PAGE(title, body));
}

/** Listens on this computer only, for the browser coming back. */
async function listenOnLoopback(
  handle: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<{ port: number; close: () => void }> {
  const servers: Server[] = [];
  const first = createServer(handle);
  await new Promise<void>((resolve, reject) => {
    first.once('error', reject);
    first.listen(0, '127.0.0.1', resolve);
  });
  servers.push(first);
  const { port } = first.address() as AddressInfo;
  // "localhost" may mean ::1 in the browser; listen there too (on the same port) if we can.
  const second = createServer(handle);
  await new Promise<void>((resolve) => {
    second.once('error', () => {
      resolve();
    });
    second.listen(port, '::1', () => {
      servers.push(second);
      resolve();
    });
  });
  return {
    port,
    close: () => {
      for (const server of servers) server.close();
    },
  };
}

export interface SignInOptions {
  /** Opens the sign-in page in the person's browser. */
  openBrowser: (url: string) => Promise<void>;
  /** Gives up after this long (the person walked away). */
  timeoutMs?: number;
  /** Cancels a sign-in that's waiting (the person pressed Cancel). */
  signal?: AbortSignal;
  now?: () => number;
}

/** Signs in with the provider in the browser; resolves with the address and tokens. */
export async function signIn(client: OAuthClient, options: SignInOptions): Promise<SignedIn> {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  const state = base64url(randomBytes(16));

  let settle: { resolve: (code: string) => void; reject: (error: unknown) => void } | undefined;
  const code = new Promise<string>((resolve, reject) => {
    settle = { resolve, reject };
  });
  // The answer can arrive while the browser is still opening; it's awaited below.
  code.catch(() => undefined);

  const loopback = await listenOnLoopback((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname !== '/' || request.method !== 'GET') {
      response.writeHead(404).end();
      return;
    }
    // Anything without our state is someone else's request: ignore it.
    if (url.searchParams.get('state') !== state) {
      response.writeHead(400).end();
      return;
    }
    const error = url.searchParams.get('error');
    const received = url.searchParams.get('code');
    if (error || !received) {
      answer(
        response,
        200,
        'Not signed in',
        'You didn’t give Postloom permission. You can close this tab and try again in Postloom.',
      );
      settle?.reject(fail('EMAIL_AUTH_FAILED', 'errors.signInCancelled'));
      return;
    }
    answer(
      response,
      200,
      'Signed in',
      'You’re signed in. You can close this tab and go back to Postloom.',
    );
    settle?.resolve(received);
  });

  const redirectUri = `http://${client.redirectHost}:${String(loopback.port)}/`;
  const timer = setTimeout(
    () => settle?.reject(fail('EMAIL_AUTH_FAILED', 'errors.signInTimedOut')),
    options.timeoutMs ?? 5 * 60_000,
  );
  const onAbort = () => settle?.reject(fail('EMAIL_AUTH_FAILED', 'errors.signInCancelled'));
  options.signal?.addEventListener('abort', onAbort);
  if (options.signal?.aborted) onAbort();

  try {
    const authorize = new URL(client.authorizeUrl);
    for (const [name, value] of Object.entries({
      response_type: 'code',
      client_id: client.clientId,
      redirect_uri: redirectUri,
      scope: client.scopes.join(' '),
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      ...client.extraParams,
    })) {
      authorize.searchParams.set(name, value);
    }
    await options.openBrowser(authorize.toString());
    const received = await code;

    const response = await postToken(client, {
      grant_type: 'authorization_code',
      code: received,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    });
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) throw fail('EMAIL_AUTH_FAILED', 'errors.signInFailed');
    const tokens = tokensFrom(json, (options.now ?? Date.now)());
    if (!tokens.refreshToken) throw fail('EMAIL_AUTH_FAILED', 'errors.signInFailed');
    return {
      ...tokens,
      refreshToken: tokens.refreshToken,
      email: emailFromIdToken(json['id_token'], client.clientId),
    };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
    loopback.close();
  }
}
