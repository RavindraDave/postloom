import { AppError } from '@postloom/core';
import { Kysely } from 'kysely';
import { Migrator, type MigrationResultSet } from 'kysely/migration';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createBackup, ensureDailyBackup } from './backups';
import { MIGRATIONS, migrationProvider } from './migrations';
import { nodeSqliteDialect } from './node-sqlite-dialect';
import type { Database } from './schema';

export interface OpenDatabaseOptions {
  /** Path of the SQLite file, or ':memory:' in tests. */
  file: string;
  /** Folder for automatic backups (created if missing). Required for files. */
  backupDir?: string;
  /** Clock, for tests. */
  now?: () => Date;
}

export interface OpenedDatabase {
  db: Kysely<Database>;
  /** Migrations applied while opening (empty when already up to date). */
  applied: string[];
  /** Backup taken before migrating, if any. */
  backupPath: string | null;
  /** Takes a backup now (e.g. "manual"); returns its path. */
  backupNow: (kind: string) => string;
  /** Takes today's backup if not taken yet and keeps the last 7. */
  ensureDailyBackup: () => string | null;
  close: () => Promise<void>;
}

/**
 * Opens (and if needed creates or upgrades) the Postloom database:
 * 1. applies safe connection settings (WAL, foreign keys, busy timeout);
 * 2. checks the file isn't damaged, and stops with DATABASE_DAMAGED if it is,
 *    so the app can offer to restore a backup instead of making it worse;
 * 3. backs up an existing database before running new migrations;
 * 4. runs pending migrations inside a transaction.
 */
export async function openDatabase(options: OpenDatabaseOptions): Promise<OpenedDatabase> {
  const now = options.now ?? (() => new Date());
  const raw = new DatabaseSync(options.file);
  let health: string;
  try {
    raw.exec('PRAGMA foreign_keys = ON;');
    raw.exec('PRAGMA busy_timeout = 5000;');
    if (options.file !== ':memory:') raw.exec('PRAGMA journal_mode = WAL;');
    const check = raw.prepare('PRAGMA quick_check;').get() as { quick_check?: string } | undefined;
    health = check?.quick_check ?? 'unknown';
  } catch (error) {
    // e.g. "file is not a database": SQLite can't even read the header.
    health = error instanceof Error ? error.message : 'unreadable';
  }
  if (health !== 'ok') {
    raw.close();
    throw new AppError({
      code: 'DATABASE_DAMAGED',
      messageKey: 'errors.databaseDamaged',
      details: { result: health.slice(0, 200) },
    });
  }

  // Decide before the migrator creates its own bookkeeping tables.
  const existedBefore = hasUserTables(raw);
  const db = new Kysely<Database>({ dialect: nodeSqliteDialect(raw) });
  const migrator = new Migrator({ db, provider: migrationProvider });

  const pending = (await migrator.getMigrations()).filter((m) => !m.executedAt);
  const isExisting = existedBefore || pending.length < Object.keys(MIGRATIONS).length;
  let backupPath: string | null = null;
  if (pending.length > 0 && isExisting && options.file !== ':memory:') {
    if (!options.backupDir) throw new Error('backupDir is required to migrate a database file');
    mkdirSync(options.backupDir, { recursive: true });
    backupPath = createBackup(
      raw,
      options.backupDir,
      `before-${pending[0]?.name ?? 'migration'}`,
      now(),
    );
  }

  const result: MigrationResultSet = await migrator.migrateToLatest();
  if (result.error) {
    await db.destroy();
    throw new AppError(
      {
        code: 'UNEXPECTED',
        messageKey: 'errors.databaseUpgradeFailed',
        ...(backupPath ? { details: { backupPath } } : {}),
      },
      { cause: result.error },
    );
  }

  return {
    db,
    applied: (result.results ?? [])
      .filter((r) => r.status === 'Success')
      .map((r) => r.migrationName),
    backupPath,
    backupNow: (kind) => {
      if (!options.backupDir) throw new Error('backupDir is required for backups');
      mkdirSync(options.backupDir, { recursive: true });
      return createBackup(raw, options.backupDir, kind, now());
    },
    ensureDailyBackup: () => {
      if (!options.backupDir) return null;
      mkdirSync(options.backupDir, { recursive: true });
      return ensureDailyBackup(raw, options.backupDir, now());
    },
    close: () => db.destroy(),
  };
}

function hasUserTables(raw: DatabaseSync): boolean {
  const row = raw
    .prepare(
      "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    )
    .get() as { n: number };
  return row.n > 0;
}
