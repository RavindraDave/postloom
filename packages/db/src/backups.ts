import { copyFileSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const PREFIX = 'postloom-';
const SUFFIX = '.sqlite';

export interface BackupInfo {
  path: string;
  fileName: string;
  /** e.g. "daily", "before-0002-sends", "manual". */
  kind: string;
  createdAt: Date;
  sizeBytes: number;
}

/**
 * Writes a consistent copy of the open database (`VACUUM INTO`) and removes
 * stored passwords from the copy: they are tied to this computer's keychain
 * and must never travel inside a backup file (PLAN.md §7.3).
 */
export function createBackup(raw: DatabaseSync, backupDir: string, kind: string, at: Date): string {
  const stamp = at.toISOString().replace(/[:.]/g, '-');
  const path = join(backupDir, `${PREFIX}${safeKind(kind)}-${stamp}${SUFFIX}`);
  raw.prepare('VACUUM INTO ?').run(path);

  const copy = new DatabaseSync(path);
  try {
    const hasAccounts = copy
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'email_accounts'")
      .get();
    if (hasAccounts) {
      copy.exec('UPDATE email_accounts SET secret_ciphertext = NULL;');
      copy.exec('VACUUM;');
    }
  } finally {
    copy.close();
  }
  return path;
}

/** Takes today's daily backup if there isn't one yet, and keeps the newest `keep`. */
export function ensureDailyBackup(
  raw: DatabaseSync,
  backupDir: string,
  at: Date,
  keep = 7,
): string | null {
  const today = at.toISOString().slice(0, 10);
  const daily = listBackups(backupDir).filter((b) => b.kind === 'daily');
  const hasToday = daily.some((b) => b.createdAt.toISOString().slice(0, 10) === today);
  const created = hasToday ? null : createBackup(raw, backupDir, 'daily', at);

  const all = listBackups(backupDir).filter((b) => b.kind === 'daily');
  for (const old of all.slice(keep)) rmSync(old.path, { force: true });
  return created;
}

/** Backups in `backupDir`, newest first. */
export function listBackups(backupDir: string): BackupInfo[] {
  if (!existsSync(backupDir)) return [];
  return readdirSync(backupDir)
    .filter((name) => name.startsWith(PREFIX) && name.endsWith(SUFFIX))
    .map((fileName) => {
      const match = /^postloom-(.+)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.sqlite$/.exec(
        fileName,
      );
      if (!match?.[1] || !match[2]) return null;
      const iso = match[2].replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, 'T$1:$2:$3.$4Z');
      const path = join(backupDir, fileName);
      return {
        path,
        fileName,
        kind: match[1],
        createdAt: new Date(iso),
        sizeBytes: statSync(path).size,
      } satisfies BackupInfo;
    })
    .filter((b): b is BackupInfo => b !== null)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Replaces the database file with a backup. The database must be closed.
 * The current file is kept alongside as "<name>.replaced-<time>" in case the
 * user changes their mind.
 */
export function restoreBackup(databaseFile: string, backupPath: string, at: Date): string {
  const check = new DatabaseSync(backupPath, { readOnly: true });
  try {
    const result = check.prepare('PRAGMA quick_check;').get() as { quick_check?: string };
    if (result.quick_check !== 'ok') throw new Error(`Backup ${basename(backupPath)} is damaged`);
  } finally {
    check.close();
  }

  const kept = `${databaseFile}.replaced-${at.toISOString().replace(/[:.]/g, '-')}`;
  if (existsSync(databaseFile)) copyFileSync(databaseFile, kept);
  for (const suffix of ['-wal', '-shm']) rmSync(`${databaseFile}${suffix}`, { force: true });
  copyFileSync(backupPath, databaseFile);
  return kept;
}

function safeKind(kind: string): string {
  return kind.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
}
