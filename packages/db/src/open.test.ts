import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { listBackups } from './backups';
import { MIGRATIONS } from './migrations';
import { openDatabase } from './open';
import { tempDir } from './test-helpers';

let cleanup = () => {};
afterEach(() => cleanup());

describe('openDatabase', () => {
  it('creates every table in a new database', async () => {
    const opened = await openDatabase({ file: ':memory:' });

    const tables = await opened.db.introspection.getTables();
    expect(tables.map((t) => t.name).sort()).toEqual([
      'app_settings',
      'assets',
      'brand_kits',
      'daily_usage',
      'email_accounts',
      'send_recipients',
      'sender_profiles',
      'sends',
      'suppression_list',
      'template_attachments',
      'template_versions',
      'templates',
    ]);
    expect(opened.applied).toEqual(Object.keys(MIGRATIONS));
    await opened.close();
  });

  it('does not back up a brand-new file, and does nothing on the next open', async () => {
    const tmp = tempDir();
    cleanup = tmp.cleanup;
    const file = join(tmp.dir, 'postloom.sqlite');
    const backupDir = join(tmp.dir, 'backups');

    const first = await openDatabase({ file, backupDir });
    expect(first.backupPath).toBeNull();
    await first.close();

    const second = await openDatabase({ file, backupDir });
    expect(second.applied).toEqual([]);
    expect(second.backupPath).toBeNull();
    expect(listBackups(backupDir)).toEqual([]);
    await second.close();
  });

  it('turns on foreign keys', async () => {
    const opened = await openDatabase({ file: ':memory:' });
    await expect(
      opened.db
        .insertInto('sender_profiles')
        .values({
          id: 's1',
          name: 'Orphan',
          email_account_id: 'missing',
          from_name: 'x',
          from_address: 'x@example.com',
          reply_to: null,
          default_cc: null,
          default_bcc: null,
          brand_kit_id: null,
          delay_ms: null,
          created_at: 'now',
          updated_at: 'now',
        })
        .execute(),
    ).rejects.toThrow(/FOREIGN KEY/);
    await opened.close();
  });

  it('refuses a damaged file instead of overwriting it', async () => {
    const tmp = tempDir();
    cleanup = tmp.cleanup;
    const file = join(tmp.dir, 'postloom.sqlite');
    writeFileSync(file, 'this is not a database'.repeat(200));

    await expect(openDatabase({ file, backupDir: join(tmp.dir, 'b') })).rejects.toMatchObject({
      code: 'DATABASE_DAMAGED',
    });
  });

  it('rejects impossible values at the database level too', async () => {
    const opened = await openDatabase({ file: ':memory:' });
    await expect(
      opened.db
        .insertInto('email_accounts')
        .values({
          id: 'a1',
          name: 'Bad',
          provider: 'other',
          host: 'smtp.example.com',
          port: 0,
          security: 'none',
          username: 'x',
          secret_ciphertext: null,
          daily_limit: null,
          delay_ms: null,
          last_tested_at: null,
          last_test_ok: null,
          created_at: 'now',
          updated_at: 'now',
        })
        .execute(),
    ).rejects.toThrow(/CHECK constraint/);
    await opened.close();
  });
});
