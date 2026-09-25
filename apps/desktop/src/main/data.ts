import { AppError } from '@postloom/core';
import type { BackupEntry } from '@postloom/contracts';
import type { Repositories } from '@postloom/db';
import type { IpcHandlers } from './ipc-router';

/** Postloom's data on this computer, as the "Your data" settings need it. */
export interface DataStore {
  /** Backups, newest first. */
  list: () => { fileName: string; kind: string; createdAt: Date; sizeBytes: number }[];
  /** Takes a backup now; returns its file name. */
  backupNow: () => string;
  /** Restores a backup when Postloom next starts, then restarts it. */
  restoreOnRestart: (fileName: string) => void;
  openFolder: () => Promise<void>;
}

export interface DataDeps {
  repos: Repositories;
  store: DataStore;
  /** True while emails are going out (restoring then would lose track of them). */
  isSending: () => boolean;
  now?: () => Date;
}

type DataHandlers = Pick<
  IpcHandlers,
  'data:backups' | 'data:backupNow' | 'data:restore' | 'data:openFolder' | 'data:clearHistory'
>;

const DAY_MS = 24 * 60 * 60 * 1000;

const toEntry = (backup: ReturnType<DataStore['list']>[number]): BackupEntry => ({
  fileName: backup.fileName,
  kind: backup.kind,
  createdAt: backup.createdAt.toISOString(),
  sizeBytes: backup.sizeBytes,
});

/**
 * Deletes sends older than the History setting (finished and stopped ones
 * only). Runs at start-up and whenever the setting changes.
 */
export async function applyHistoryRetention(
  repos: Repositories,
  historyDays: number,
  now: Date = new Date(),
): Promise<number> {
  if (historyDays <= 0) return 0;
  const before = new Date(now.getTime() - historyDays * DAY_MS).toISOString();
  return repos.sends.deleteFinished(before);
}

export function createDataHandlers({ repos, store, isSending }: DataDeps): DataHandlers {
  return {
    'data:backups': () => Promise.resolve(store.list().map(toEntry)),

    'data:backupNow': () =>
      Promise.resolve().then(() => {
        const fileName = store.backupNow();
        const made = store.list().find((backup) => backup.fileName === fileName);
        if (!made) throw new AppError({ code: 'UNEXPECTED', messageKey: 'errors.unexpected' });
        return toEntry(made);
      }),

    'data:restore': ({ fileName }) =>
      Promise.resolve().then(() => {
        if (isSending()) {
          throw new AppError({
            code: 'VALIDATION_FAILED',
            messageKey: 'errors.restoreWhileSending',
          });
        }
        // Only a backup from the list can be restored: never a path from the screen.
        if (!store.list().some((backup) => backup.fileName === fileName)) {
          throw new AppError({ code: 'NOT_FOUND', messageKey: 'errors.notFound' });
        }
        store.restoreOnRestart(fileName);
        return { ok: true as const };
      }),

    'data:openFolder': async () => {
      await store.openFolder();
      return { ok: true as const };
    },

    'data:clearHistory': async () => ({ deleted: await repos.sends.deleteFinished(null) }),
  };
}
