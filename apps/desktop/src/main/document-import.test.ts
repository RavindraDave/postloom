import { createRepositories, openDatabase, type OpenedDatabase } from '@postloom/db';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeDocx } from '../../e2e/docx';
import { makePng } from '../../e2e/png';
import { importDocumentFile } from './document-import';
import type { CodecImage, ImageCodec } from './images';

function fakeImage(width: number, height: number): CodecImage {
  return {
    getSize: () => ({ width, height }),
    resize: ({ width: newWidth }: { width: number }) =>
      fakeImage(newWidth, Math.round((height * newWidth) / width)),
    toPNG: () => makePng(width, 1, [1, 2, 3]),
    toJPEG: () => new Uint8Array(500).fill(2),
  };
}
const codec: ImageCodec = { decode: () => fakeImage(200, 100) };

let opened: OpenedDatabase;
let repos: ReturnType<typeof createRepositories>;
let folder: string;

beforeEach(async () => {
  opened = await openDatabase({ file: ':memory:' });
  repos = createRepositories(opened.db);
  folder = mkdtempSync(join(tmpdir(), 'postloom-import-'));
});
afterEach(async () => {
  await opened.close();
  rmSync(folder, { recursive: true, force: true });
});

describe('importing a Word document', () => {
  it('turns text, tables and pictures into HTML with stored pictures', async () => {
    const file = join(folder, 'Invoice letter.docx');
    writeFileSync(file, makeDocx());

    const imported = await importDocumentFile(file, { repos, codec });

    expect(imported.name).toBe('Invoice letter.docx');
    expect(imported.kind).toBe('docx');
    expect(imported.assetIds).toHaveLength(1);
    const id = imported.assetIds[0] ?? '';
    expect(imported.html).toContain(`data-asset="${id}"`);
    expect(imported.html).toContain('alt="Company logo"');
    expect(imported.html).toContain('Dear «First Name»,');
    expect(imported.html).toContain('<table>');
    expect((await repos.assets.read(id))?.mime).toBe('image/png');
  });

  it('explains that old .doc files need saving as .docx', async () => {
    const file = join(folder, 'old.doc');
    writeFileSync(file, 'x');
    await expect(importDocumentFile(file, { repos, codec })).rejects.toMatchObject({
      messageKey: 'errors.wordOldFormat',
    });
  });
});

describe('importing an HTML email', () => {
  it('keeps embedded pictures and pictures in its folder, and nothing outside it', async () => {
    const png = makePng(4, 4, [200, 0, 0]);
    mkdirSync(join(folder, 'email', 'images'), { recursive: true });
    writeFileSync(join(folder, 'email', 'images', 'logo.png'), png);
    writeFileSync(join(folder, 'secret.png'), makePng(4, 4, [0, 200, 0]));
    const file = join(folder, 'email', 'news.html');
    writeFileSync(
      file,
      `<p><img src="data:image/png;base64,${png.toString('base64')}" alt="Inline"></p>
       <p><img src="images/logo.png" alt='Our "logo"'></p>
       <p><img src="../secret.png"></p>
       <p><img src="https://example.org/web.png"></p>`,
    );

    const imported = await importDocumentFile(file, { repos, codec });

    expect(imported.kind).toBe('html');
    // The inline picture and the file are the same bytes, so they're stored once.
    expect(imported.assetIds).toHaveLength(1);
    expect(imported.html.match(/data-asset=/g)).toHaveLength(2);
    expect(imported.html).toContain('alt="Our &quot;logo&quot;"');
    expect(imported.html).toContain('src="../secret.png"');
    expect(imported.html).toContain('src="https://example.org/web.png"');
  });

  it('refuses very big HTML files', async () => {
    const file = join(folder, 'big.html');
    writeFileSync(file, 'x'.repeat(3 * 1024 * 1024));
    await expect(importDocumentFile(file, { repos, codec })).rejects.toMatchObject({
      messageKey: 'errors.htmlTooBig',
    });
  });
});
