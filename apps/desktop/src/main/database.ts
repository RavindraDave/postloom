import { AppError } from '@postloom/core';
import { listBackups, openDatabase, restoreBackup, type OpenedDatabase } from '@postloom/db';
import { existsSync, readFileSync, rmSync } from 'node:fs';
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

/**
 * Restores the backup chosen in Settings (recorded in `pendingFile`) before
 * the database is opened: an open database can't be replaced. The current
 * file is kept alongside. Only a backup from the backups folder is used.
 * Returns the restored backup's file name, if any.
 */
export function restorePendingBackup(
  location: DatabaseLocation,
  pendingFile: string,
): string | null {
  if (!existsSync(pendingFile)) return null;
  try {
    const { fileName } = JSON.parse(readFileSync(pendingFile, 'utf8')) as { fileName?: unknown };
    const backup = listBackups(location.backupDir).find((b) => b.fileName === fileName);
    if (!backup) return null;
    restoreBackup(location.file, backup.path, new Date());
    return backup.fileName;
  } catch (error) {
    console.error('[data] restoring the backup failed', error);
    return null;
  } finally {
    rmSync(pendingFile, { force: true });
  }
}
