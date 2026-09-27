import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';
import { devContentSecurityPolicy } from './src/main/csp';

// Workspace packages ship TypeScript source, so they are bundled rather than
// externalized. Third-party runtime dependencies stay external (node_modules).
const workspacePackages = [
  '@postloom/core',
  '@postloom/contracts',
  '@postloom/db',
  '@postloom/editor',
  '@postloom/email',
  '@postloom/recipients',
  '@postloom/sending',
];

/**
 * Google and Microsoft sign-in app ids, from the release build's environment
 * (see docs/oauth-setup.md). They aren't secrets: desktop apps can't keep
 * secrets, which is why sign-in uses PKCE. Left empty, sign-in isn't offered.
 */
const oauthIds = {
  __POSTLOOM_GOOGLE_CLIENT_ID__: JSON.stringify(process.env['POSTLOOM_GOOGLE_CLIENT_ID'] ?? ''),
  __POSTLOOM_GOOGLE_CLIENT_SECRET__: JSON.stringify(
    process.env['POSTLOOM_GOOGLE_CLIENT_SECRET'] ?? '',
  ),
  __POSTLOOM_MICROSOFT_CLIENT_ID__: JSON.stringify(
    process.env['POSTLOOM_MICROSOFT_CLIENT_ID'] ?? '',
  ),
};

export default defineConfig({
  main: {
    define: oauthIds,
    build: {
      externalizeDeps: { exclude: workspacePackages },
      rollupOptions: {
        // The sending engine runs in its own utility process (PLAN.md §9).
        input: { index: 'src/main/index.ts', sender: 'src/sender/index.ts' },
      },
    },
  },
  preload: {
    build: {
      // Sandboxed preload scripts must be a single CommonJS file with no imports
      // other than 'electron'.
      externalizeDeps: false,
      rollupOptions: {
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    plugins: [
      react(),
      {
        // The production CSP is sent as a response header by the app:// protocol
        // handler. The dev server needs a looser policy for hot reloading.
        name: 'postloom-dev-csp',
        apply: 'serve',
        transformIndexHtml: () => [
          {
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: devContentSecurityPolicy },
            injectTo: 'head-prepend',
          },
        ],
      },
    ],
  },
});
