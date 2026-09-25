import { AppError } from '@postloom/core';
import { listBackups, openDatabase, restoreBackup, type OpenedDatabase } from '@postloom/db';
import { join } from 'node:path';

export interface DatabaseLocation {
  file: string;
  backupDir: string;
}

export function databaseLocation(userDataDir: string): DatabaseLocation {
  return {
    file: join(userDataDir, 'postloom.sqlite'),
    backupDir: join(userDataDir, 'backups'),
  };
}

/** What to do when the database file is damaged; the UI asks the person. */
export type DamagedChoice = 'restore-latest' | 'quit';

/**
 * Opens the app database. If the file is damaged, asks (via `onDamaged`)
 * whether to restore the newest backup, never silently replacing data.
 */
export async function openAppDatabase(
  location: DatabaseLocation,
  onDamaged: (latestBackup: { fileName: string; createdAt: Date } | null) => DamagedChoice,
): Promise<OpenedDatabase | null> {
  try {
    const opened = await openDatabase(location);
    opened.ensureDailyBackup();
    return opened;
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== 'DATABASE_DAMAGED') throw error;

    const latest = listBackups(location.backupDir)[0] ?? null;
    const choice = onDamaged(latest && { fileName: latest.fileName, createdAt: latest.createdAt });
    if (choice !== 'restore-latest' || !latest) return null;

    restoreBackup(location.file, latest.path, new Date());
    return openDatabase(location);
  }
}
