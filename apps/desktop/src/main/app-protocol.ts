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

/** Serves the bundled UI from `rootDir` as app://postloom/... with a strict CSP header. */
export function serveAppProtocol(rootDir: string): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url);
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

function notFound(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain', 'Content-Security-Policy': contentSecurityPolicy },
  });
}
