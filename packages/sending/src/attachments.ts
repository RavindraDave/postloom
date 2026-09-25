import { isSensitivePath, MAX_ATTACHMENT_BYTES } from '@postloom/core';
import type { FileAttachment } from '@postloom/email';
import { readFile, realpath, stat } from 'node:fs/promises';
import { basename } from 'node:path';

/** Why one person's email couldn't be made; recorded as their reason. */
export class BuildError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'BuildError';
    this.code = code;
  }
}

/**
 * Reads a person's attachments just before sending. They were checked when
 * the send started; they're checked again now, because files can change or
 * disappear in the meantime (and a shortcut could now point at a key file).
 */
export async function readAttachments(paths: string[]): Promise<FileAttachment[]> {
  const files: FileAttachment[] = [];
  let total = 0;
  for (const path of paths) {
    let real: string;
    try {
      real = await realpath(path);
    } catch {
      throw new BuildError('attachmentMissing');
    }
    if (isSensitivePath(path) || isSensitivePath(real)) throw new BuildError('attachmentBlocked');
    const info = await stat(real).catch(() => null);
    if (!info?.isFile()) throw new BuildError('attachmentMissing');
    total += info.size;
    if (total > MAX_ATTACHMENT_BYTES) throw new BuildError('attachmentTooBig');
    files.push({ filename: basename(real), content: new Uint8Array(await readFile(real)) });
  }
  return files;
}
