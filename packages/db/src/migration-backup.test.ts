import type { Kysely } from 'kysely';
import type * as MigrationsModule from './migrations';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tempDir } from './test-helpers';

// Simulates an app update that ships a new migration: the database must be
// backed up before it is changed.
vi.mock('./migrations', async (importOriginal) => {
  const original = await importOriginal<typeof MigrationsModule>();
  const MIGRATIONS = {
    ...original.MIGRATIONS,
    '0002-test-column': {
      up: async (db: Kysely<unknown>) => {
        await db.schema.alterTable('templates').addColumn('test_note', 'text').execute();
      },
    },
  };
  let includeSecond = false;
  return {
    MIGRATIONS,
    migrationProvider: {
      getMigrations: () =>
        Promise.resolve(
          includeSecond ? MIGRATIONS : { '0001-initial': original.MIGRATIONS['0001-initial']! },
        ),
    },
    enableSecondMigration: () => {
      includeSecond = true;
    },
  };
});

const { openDatabase } = await import('./open');
const migrations = (await import('./migrations')) as unknown as {
  enableSecondMigration: () => void;
};

let cleanup = () => {};
afterEach(() => cleanup());

describe('upgrading an existing database', () => {
  it('backs up first, then migrates, and keeps passwords out of the backup', async () => {
    const tmp = tempDir();
    cleanup = tmp.cleanup;
    const file = join(tmp.dir, 'postloom.sqlite');
    const backupDir = join(tmp.dir, 'backups');

    const v1 = await openDatabase({ file, backupDir });
    await v1.db
      .insertInto('email_accounts')
      .values({
        id: 'a1',
        name: 'Office Gmail',
        provider: 'gmail',
        host: 'smtp.gmail.com',
        port: 587,
        security: 'starttls',
        username: 'asha@example.com',
        secret_ciphertext: new Uint8Array([1, 2, 3]),
        daily_limit: null,
        delay_ms: null,
        last_tested_at: null,
        last_test_ok: null,
        created_at: 'now',
        updated_at: 'now',
      })
      .execute();
    await v1.close();

    migrations.enableSecondMigration();
    const v2 = await openDatabase({ file, backupDir, now: () => new Date('2026-10-01T10:00:00Z') });

    expect(v2.applied).toEqual(['0002-test-column']);
    expect(v2.backupPath).toMatch(
      /postloom-before-0002-test-column-2026-10-01T10-00-00-000Z\.sqlite$/,
    );

    const backup = new DatabaseSync(v2.backupPath!, { readOnly: true });
    const row = backup.prepare('SELECT name, secret_ciphertext FROM email_accounts').get() as {
      name: string;
      secret_ciphertext: unknown;
    };
    const columns = backup.prepare('PRAGMA table_info(templates)').all() as { name: string }[];
    backup.close();

    expect(row).toEqual({ name: 'Office Gmail', secret_ciphertext: null });
    expect(columns.map((c) => c.name)).not.toContain('test_note');
    await v2.close();
  });
});
