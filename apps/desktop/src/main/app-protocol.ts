import { net, protocol } from 'electron';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { APP_HOST, APP_SCHEME } from './security';
import { contentSecurityPolicy } from './csp';

/** Must run before the app is ready. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true },
    },
  ]);
}

/**
 * Resolves a request path inside `rootDir`, or returns null if it would
 * escape it (path traversal such as `app://postloom/../../etc/passwd`).
 */
export function resolveInsideRoot(rootDir: string, requestPath: string): string | null {
  const decoded = decodeURIComponent(requestPath);
  const target = resolve(rootDir, `.${sep}${decoded === '/' ? 'index.html' : decoded}`);
  const rel = relative(rootDir, target);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    return null;
  }
  return target;
}

/** Reads a stored picture's bytes (set once the database is open). */
export type AssetReader = (id: string) => Promise<{ mime: string; bytes: Uint8Array } | null>;

const ASSET_PATH = /^\/assets\/([A-Za-z0-9-]{1,64})$/;

/**
 * Serves the bundled UI from `rootDir` as app://postloom/... with a strict
 * CSP header, and stored pictures as app://postloom/assets/<id>.
 */
export function serveAppProtocol(rootDir: string, readAsset: () => AssetReader | null): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url);
    const asset = url.host === APP_HOST ? ASSET_PATH.exec(url.pathname) : null;
    if (asset?.[1]) return serveAsset(readAsset(), asset[1]);

    const filePath = url.host === APP_HOST ? resolveInsideRoot(rootDir, url.pathname) : null;
    if (!filePath) {
      return notFound();
    }

    let response: Response;
    try {
      response = await net.fetch(pathToFileURL(filePath).toString());
    } catch {
      return notFound();
    }
    const headers = new Headers(response.headers);
    headers.set('Content-Security-Policy', contentSecurityPolicy);
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(response.body, { status: response.status, headers });
  });
}

async function serveAsset(read: AssetReader | null, id: string): Promise<Response> {
  const asset = read ? await read(id).catch(() => null) : null;
  // Only pictures Postloom stored itself (always PNG or JPEG) are ever served.
  if (!asset || (asset.mime !== 'image/png' && asset.mime !== 'image/jpeg')) return notFound();
  return new Response(Buffer.from(asset.bytes), {
    headers: {
      'Content-Type': asset.mime,
      'Content-Security-Policy': contentSecurityPolicy,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    },
  });
}

function notFound(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain', 'Content-Security-Policy': contentSecurityPolicy },
  });
}
