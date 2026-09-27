import { AppError } from '@postloom/core';
import type { Repositories } from '@postloom/db';
import { MAX_IMAGE_WIDTH } from '@postloom/editor';
import mammoth from 'mammoth';
import { open, realpath } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { prepareImage, type ImageCodec } from './images';

/** HTML emails are small; anything bigger is almost certainly not one. */
export const MAX_HTML_FILE_BYTES = 2 * 1024 * 1024;
/** Word files carry their pictures, so they may be bigger. */
export const MAX_WORD_FILE_BYTES = 25 * 1024 * 1024;
/** At most this many pictures come along from one file. */
export const MAX_IMPORTED_PICTURES = 30;

export interface ImportedFile {
  name: string;
  /** HTML for the renderer's import, where pictures are `<img data-asset>`. */
  html: string;
  kind: 'html' | 'docx';
  /** Pictures stored from the file; only these may appear as `data-asset`. */
  assetIds: string[];
}

interface ImportDeps {
  repos: Repositories;
  codec: ImageCodec;
}

/**
 * Reads an HTML email or a Word document the person picked. Pictures inside
 * it (embedded, or files next to an HTML email) are checked and re-encoded
 * like any picture added with "Picture", and stored with the template's
 * pictures. Pictures on the web are left for the person to add.
 */
export async function importDocumentFile(path: string, deps: ImportDeps): Promise<ImportedFile> {
  const extension = extname(path).toLowerCase();
  const name = basename(path);
  if (extension === '.doc') {
    throw new AppError({ code: 'VALIDATION_FAILED', messageKey: 'errors.wordOldFormat' });
  }
  if (extension === '.docx') {
    const bytes = await readCapped(path, MAX_WORD_FILE_BYTES);
    if (!bytes) throw new AppError({ code: 'VALIDATION_FAILED', messageKey: 'errors.wordTooBig' });
    return { name, kind: 'docx', ...(await wordToHtml(bytes, deps)) };
  }
  const bytes = await readCapped(path, MAX_HTML_FILE_BYTES);
  if (!bytes) throw new AppError({ code: 'VALIDATION_FAILED', messageKey: 'errors.htmlTooBig' });
  const html = bytes.toString('utf8');
  return { name, kind: 'html', ...(await keepHtmlPictures(html, dirname(path), deps)) };
}

/**
 * Reads a file, or null when it is bigger than `max`. The size is checked on
 * the open file itself, so the file can't be swapped between check and read.
 */
async function readCapped(path: string, max: number): Promise<Buffer | null> {
  const file = await open(path, 'r');
  try {
    if ((await file.stat()).size > max) return null;
    return await file.readFile();
  } finally {
    await file.close();
  }
}

/** Stores one picture; null when it isn't a picture Postloom can use. */
async function storePicture(
  bytes: Uint8Array,
  label: string,
  deps: ImportDeps,
): Promise<{ id: string; width: number } | null> {
  try {
    const prepared = prepareImage(bytes, deps.codec);
    const asset = await deps.repos.assets.put({ ...prepared, name: label.slice(0, 120) });
    return { id: asset.id, width: Math.min(prepared.width, MAX_IMAGE_WIDTH) };
  } catch {
    return null;
  }
}

async function wordToHtml(
  buffer: Buffer,
  deps: ImportDeps,
): Promise<{ html: string; assetIds: string[] }> {
  const assetIds: string[] = [];
  const result = await mammoth.convertToHtml(
    { buffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        if (assetIds.length >= MAX_IMPORTED_PICTURES) return { src: '' };
        const stored = await storePicture(await image.readAsBuffer(), 'Word picture', deps);
        if (!stored) return { src: '' };
        assetIds.push(stored.id);
        return {
          src: '',
          'data-asset': stored.id,
          width: String(stored.width),
          // mammoth adds the picture's alt text from Word itself.
        };
      }),
    },
  );
  return { html: result.value, assetIds: [...new Set(assetIds)] };
}

const IMG_TAG = /<img\b[^>]*>/gi;
const SRC = /\bsrc\s*=\s*(["'])(.*?)\1/i;
const ALT = /\balt\s*=\s*(["'])(.*?)\1/i;
const DATA_URL = /^data:image\/(?:png|jpe?g);base64,([A-Za-z0-9+/=\s]+)$/i;
const PICTURE_FILE = /\.(png|jpe?g)$/i;

/**
 * Pictures written into an HTML email (data: addresses) or kept next to it
 * (images/logo.png) are stored; web pictures are left as they are for the
 * renderer to count. Only files inside the email's own folder are read.
 */
async function keepHtmlPictures(
  html: string,
  folder: string,
  deps: ImportDeps,
): Promise<{ html: string; assetIds: string[] }> {
  const assetIds: string[] = [];
  const replacements = new Map<string, string>();
  const root = await realpath(folder);

  for (const tag of new Set(html.match(IMG_TAG) ?? [])) {
    if (assetIds.length >= MAX_IMPORTED_PICTURES) break;
    const src = SRC.exec(tag)?.[2]?.trim() ?? '';
    const bytes = await pictureBytes(src, root);
    if (!bytes) continue;
    const stored = await storePicture(bytes, basename(src).slice(0, 60) || 'Picture', deps);
    if (!stored) continue;
    assetIds.push(stored.id);
    const alt = escapeAttribute(ALT.exec(tag)?.[2] ?? '');
    replacements.set(
      tag,
      `<img data-asset="${stored.id}" width="${String(stored.width)}" alt="${alt}">`,
    );
  }
  return {
    html: html.replace(IMG_TAG, (tag) => replacements.get(tag) ?? tag),
    assetIds: [...new Set(assetIds)],
  };
}

async function pictureBytes(src: string, root: string): Promise<Uint8Array | null> {
  const embedded = DATA_URL.exec(src);
  if (embedded?.[1]) return Buffer.from(embedded[1].replace(/\s+/g, ''), 'base64');

  // A file next to the email: no web addresses, no absolute paths, no way out of the folder.
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//') || isAbsolute(src)) return null;
  const path = decodeURIComponent(src.split(/[?#]/)[0] ?? '');
  if (!PICTURE_FILE.test(path)) return null;
  try {
    const real = await realpath(resolve(root, path));
    const inside = relative(root, real);
    if (inside.startsWith('..') || isAbsolute(inside)) return null;
    return await readCapped(real, 20 * 1024 * 1024);
  } catch {
    return null;
  }
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
