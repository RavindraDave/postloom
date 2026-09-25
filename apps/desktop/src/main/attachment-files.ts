import { isSensitivePath } from '@postloom/core';
import { realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';

/** One file named in the spreadsheet, as found (or not) on this computer. */
export interface AttachmentFile {
  /** As typed in the spreadsheet. */
  typed: string;
  /** The real path (shortcuts followed), or null when the file isn't there. */
  path: string | null;
  name: string;
  size: number;
  problem: 'missing' | 'blocked' | null;
  /** The folder it's in, when that's not one the person has approved. */
  outsideFolder: string | null;
}

export interface FileSystem {
  realpath: (path: string) => string;
  /** Size in bytes, or null when it isn't a regular file. */
  size: (path: string) => number | null;
}

export const nodeFileSystem: FileSystem = {
  realpath: (path) => realpathSync.native(path),
  size: (path) => {
    const stat = statSync(path);
    return stat.isFile() ? stat.size : null;
  },
};

const isInside = (folder: string, path: string) => {
  const rel = relative(folder, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

/**
 * Finds the files a spreadsheet row names. Paths may be absolute or relative
 * to the spreadsheet's folder. Files are checked where they really are (after
 * following shortcuts), so a shortcut can't smuggle out a key file. The
 * spreadsheet's own folder is always approved.
 */
export function createAttachmentResolver(
  listFolder: string | null,
  approvedFolders: string[],
  fs: FileSystem = nodeFileSystem,
) {
  const real = (path: string) => {
    try {
      return fs.realpath(path);
    } catch {
      return path;
    }
  };
  const approved = [...(listFolder ? [listFolder] : []), ...approvedFolders].map(real);
  const cache = new Map<string, AttachmentFile>();

  return (typed: string): AttachmentFile => {
    const cached = cache.get(typed);
    if (cached) return cached;
    const name = basename(typed.replace(/\\/g, '/'));
    let result: AttachmentFile;
    if (!isAbsolute(typed) && !listFolder) {
      result = { typed, path: null, name, size: 0, problem: 'missing', outsideFolder: null };
    } else {
      const wanted = isAbsolute(typed) ? typed : resolve(listFolder ?? '', typed);
      let path: string | null = null;
      let size: number | null = null;
      try {
        path = fs.realpath(wanted);
        size = fs.size(path);
      } catch {
        path = null;
      }
      if (isSensitivePath(typed) || isSensitivePath(wanted) || (path && isSensitivePath(path))) {
        result = { typed, path: null, name, size: 0, problem: 'blocked', outsideFolder: null };
      } else if (!path || size === null) {
        result = { typed, path: null, name, size: 0, problem: 'missing', outsideFolder: null };
      } else {
        const folder = dirname(path);
        result = {
          typed,
          path,
          name: basename(path),
          size,
          problem: null,
          outsideFolder: approved.some((ok) => isInside(ok, path)) ? null : folder,
        };
      }
    }
    cache.set(typed, result);
    return result;
  };
}
