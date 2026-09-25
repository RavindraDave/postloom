import { MAX_ATTACHMENT_BYTES } from '@postloom/core';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BuildError, readAttachments } from './attachments';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'postloom-attach-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const failure = async (paths: string[]) => {
  try {
    await readAttachments(paths);
  } catch (error) {
    return error instanceof BuildError ? error.code : String(error);
  }
  return 'no error';
};

describe('reading attachments at send time', () => {
  it('reads each file with its own name', async () => {
    writeFileSync(join(dir, 'INV-1.pdf'), 'pdf!');
    writeFileSync(join(dir, 'terms.txt'), 'terms');
    const files = await readAttachments([join(dir, 'INV-1.pdf'), join(dir, 'terms.txt')]);
    expect(files.map((f) => [f.filename, new TextDecoder().decode(f.content)])).toEqual([
      ['INV-1.pdf', 'pdf!'],
      ['terms.txt', 'terms'],
    ]);
  });

  it('fails the person when a file has gone, or is a folder', async () => {
    mkdirSync(join(dir, 'folder'));
    expect(await failure([join(dir, 'gone.pdf')])).toBe('attachmentMissing');
    expect(await failure([join(dir, 'folder')])).toBe('attachmentMissing');
  });

  it('refuses a key file, even behind a harmless-looking shortcut', async () => {
    mkdirSync(join(dir, '.ssh'));
    writeFileSync(join(dir, '.ssh', 'id_rsa'), 'secret');
    symlinkSync(join(dir, '.ssh', 'id_rsa'), join(dir, 'invoice.pdf'));
    expect(await failure([join(dir, 'invoice.pdf')])).toBe('attachmentBlocked');
    expect(await failure([join(dir, '.ssh', 'id_rsa')])).toBe('attachmentBlocked');
  });

  it('refuses attachments too big for one email', async () => {
    const big = join(dir, 'big.zip');
    writeFileSync(big, '');
    truncateSync(big, MAX_ATTACHMENT_BYTES + 1);
    expect(await failure([big])).toBe('attachmentTooBig');
  });
});
