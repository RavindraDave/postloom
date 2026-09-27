import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A stand-in for Google's and Microsoft's sign-in services and the Gmail API,
 * for tests. It behaves like the real ones where it matters: PKCE is checked,
 * codes work once, refresh tokens can be revoked, and Microsoft hands out a
 * new refresh token each time.
 */
export interface FakeOAuthServer {
  base: string;
  /** The address each provider signs the person in as. */
  emails: Record<'google' | 'microsoft', string>;
  /** Emails received by the fake Gmail API (raw MIME). */
  gmailSent: { token: string; raw: string }[];
  /** Access tokens the fake Gmail API and SMTP server accept. */
  validAccessTokens: Set<string>;
  /** Refresh tokens that still work (remove one to "revoke" it). */
  validRefreshTokens: Set<string>;
  /** When set, the next sign-in is refused, as if the person pressed "Cancel". */
  denyNext: boolean;
  close(): Promise<void>;
}

const base64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');

function idToken(clientId: string, email: string, provider: 'google' | 'microsoft') {
  const claims =
    provider === 'google'
      ? { aud: clientId, email, email_verified: true }
      : { aud: clientId, preferred_username: email };
  return `${base64url('{"alg":"none"}')}.${base64url(JSON.stringify(claims))}.sig`;
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
}

export async function startFakeOAuth(
  emails: Partial<Record<'google' | 'microsoft', string>> = {},
): Promise<FakeOAuthServer> {
  const codes = new Map<
    string,
    { challenge: string; provider: 'google' | 'microsoft'; redirect: string; clientId: string }
  >();
  let counter = 0;
  const next = (prefix: string) => `${prefix}-${String(++counter)}`;

  const state: FakeOAuthServer = {
    base: '',
    emails: {
      google: emails.google ?? 'asha@gmail.example',
      microsoft: emails.microsoft ?? 'asha@outlook.example',
    },
    gmailSent: [],
    validAccessTokens: new Set(),
    validRefreshTokens: new Set(),
    denyNext: false,
    close: () => Promise.resolve(),
  };

  const issue = (provider: 'google' | 'microsoft', clientId: string, withRefresh: boolean) => {
    const accessToken = next(`${provider}-access`);
    state.validAccessTokens.add(accessToken);
    const body: Record<string, unknown> = {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      id_token: idToken(clientId, state.emails[provider], provider),
    };
    if (withRefresh) {
      const refresh = next(`${provider}-refresh`);
      state.validRefreshTokens.add(refresh);
      body['refresh_token'] = refresh;
    }
    return body;
  };

  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', 'http://fake');
      const [, provider, action] = url.pathname.split('/') as [string, string, string];

      // Gmail API: send one email.
      if (url.pathname === '/upload/gmail/v1/users/me/messages/send') {
        const token = (request.headers.authorization ?? '').replace(/^Bearer /, '');
        const raw = (await readBody(request)).toString('utf8');
        if (!state.validAccessTokens.has(token)) {
          json(response, 401, { error: 'unauthorized' });
          return;
        }
        state.gmailSent.push({ token, raw });
        {
          json(response, 200, { id: next('gmail-message') });
          return;
        }
      }

      if (provider !== 'google' && provider !== 'microsoft') {
        json(response, 404, {});
        return;
      }

      if (action === 'authorize') {
        const redirect = url.searchParams.get('redirect_uri') ?? '';
        const back = new URL(redirect);
        back.searchParams.set('state', url.searchParams.get('state') ?? '');
        if (state.denyNext) {
          state.denyNext = false;
          back.searchParams.set('error', 'access_denied');
        } else {
          const code = next(`${provider}-code`);
          codes.set(code, {
            challenge: url.searchParams.get('code_challenge') ?? '',
            provider,
            redirect,
            clientId: url.searchParams.get('client_id') ?? '',
          });
          back.searchParams.set('code', code);
        }
        response.writeHead(302, { Location: back.toString() }).end();
        return;
      }

      if (action === 'token' && request.method === 'POST') {
        const form = new URLSearchParams((await readBody(request)).toString('utf8'));
        const clientId = form.get('client_id') ?? '';
        if (provider === 'google' && form.get('client_secret') !== 'test-google-secret') {
          {
            json(response, 401, { error: 'invalid_client' });
            return;
          }
        }
        if (form.get('grant_type') === 'authorization_code') {
          const saved = codes.get(form.get('code') ?? '');
          codes.delete(form.get('code') ?? '');
          const verifier = form.get('code_verifier') ?? '';
          const challenge = createHash('sha256').update(verifier).digest('base64url');
          if (
            !saved ||
            saved.provider !== provider ||
            saved.redirect !== form.get('redirect_uri') ||
            saved.challenge !== challenge
          ) {
            {
              json(response, 400, { error: 'invalid_grant' });
              return;
            }
          }
          {
            json(response, 200, issue(provider, clientId, true));
            return;
          }
        }
        if (form.get('grant_type') === 'refresh_token') {
          const refresh = form.get('refresh_token') ?? '';
          if (!state.validRefreshTokens.has(refresh)) {
            {
              json(response, 400, { error: 'invalid_grant' });
              return;
            }
          }
          // Microsoft rotates refresh tokens; Google keeps the same one.
          if (provider === 'microsoft') state.validRefreshTokens.delete(refresh);
          {
            json(response, 200, issue(provider, clientId, provider === 'microsoft'));
            return;
          }
        }
      }
      json(response, 400, { error: 'unsupported' });
    })();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  state.base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  state.close = () =>
    new Promise((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  return state;
}
