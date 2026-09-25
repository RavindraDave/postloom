import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ net: {}, protocol: {} }));

const { resolveInsideRoot } = await import('./app-protocol');

const root = resolve('/opt/postloom/renderer');

describe('resolveInsideRoot', () => {
  it('serves index.html for the root path', () => {
    expect(resolveInsideRoot(root, '/')).toBe(join(root, 'index.html'));
  });

  it('resolves files inside the renderer folder', () => {
    expect(resolveInsideRoot(root, '/assets/index-abc.js')).toBe(
      join(root, 'assets', 'index-abc.js'),
    );
  });

  it.each(['/../../etc/passwd', '/assets/../../secret.txt', '/%2e%2e/%2e%2e/etc/passwd'])(
    'refuses to leave the renderer folder: %s',
    (path) => {
      expect(resolveInsideRoot(root, path)).toBeNull();
    },
  );
});
