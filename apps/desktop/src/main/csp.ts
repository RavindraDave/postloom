/**
 * Content Security Policy for the app window (PLAN.md §10.2).
 * - Scripts only from the app bundle; no eval, no inline scripts.
 * - Inline styles are allowed because Mantine and the email designer use them.
 * - Frames only for the sandboxed, script-less email preview (srcdoc).
 */
export const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self' about:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

/** Development only: Vite's hot reload needs inline scripts and a websocket. */
export const devContentSecurityPolicy = contentSecurityPolicy
  .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
  .replace("connect-src 'self'", "connect-src 'self' ws://localhost:* http://localhost:*");
