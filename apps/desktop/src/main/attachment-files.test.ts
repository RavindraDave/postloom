import { describe, expect, it } from 'vitest';
import { createAttachmentResolver, type FileSystem } from './attachment-files';

/** A pretend disk: paths to sizes, plus shortcuts. */
function fakeDisk(files: Record<string, number>, links: Record<string, string> = {}): FileSystem {
  return {
    realpath: (path) => {
      const target = links[path] ?? path;
      if (!(target in files) && !Object.keys(files).some((f) => f.startsWith(`${target}/`))) {
        throw new Error('ENOENT');
      }
      return target;
    },
    size: (path) => files[path] ?? null,
  };
}

const disk = fakeDisk(
  {
    '/lists/invoices/INV-1.pdf': 1200,
    '/lists/terms.pdf': 300,
    '/elsewhere/brochure.pdf': 5000,
    '/home/asha/.ssh/id_rsa': 400,
  },
  { '/lists/innocent.pdf': '/home/asha/.ssh/id_rsa' },
);

describe('finding attachment files', () => {
  it('finds files next to the list, by relative or absolute path', () => {
    const resolve = createAttachmentResolver('/lists', [], disk);
    expect(resolve('invoices/INV-1.pdf')).toEqual({
      typed: 'invoices/INV-1.pdf',
      path: '/lists/invoices/INV-1.pdf',
      name: 'INV-1.pdf',
      size: 1200,
      problem: null,
      outsideFolder: null,
    });
    expect(resolve('/lists/terms.pdf')).toMatchObject({ size: 300, problem: null });
  });

  it('reports missing files', () => {
    const resolve = createAttachmentResolver('/lists', [], disk);
    expect(resolve('nope.pdf')).toMatchObject({ problem: 'missing', path: null, name: 'nope.pdf' });
    // A relative path needs the list's folder to mean anything.
    expect(createAttachmentResolver(null, [], disk)('terms.pdf').problem).toBe('missing');
  });

  it('blocks key files, including through a shortcut', () => {
    const resolve = createAttachmentResolver('/lists', [], disk);
    expect(resolve('/home/asha/.ssh/id_rsa')).toMatchObject({ problem: 'blocked', path: null });
    expect(resolve('innocent.pdf')).toMatchObject({ problem: 'blocked', path: null });
  });

  it('flags files outside the list’s folder until that folder is approved', () => {
    expect(createAttachmentResolver('/lists', [], disk)('/elsewhere/brochure.pdf')).toMatchObject({
      problem: null,
      outsideFolder: '/elsewhere',
    });
    expect(
      createAttachmentResolver('/lists', ['/elsewhere'], disk)('/elsewhere/brochure.pdf')
        .outsideFolder,
    ).toBeNull();
  });
});
