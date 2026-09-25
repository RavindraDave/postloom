import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { listBackups, restoreBackup } from './backups';
import { openDatabase } from './open';
import { createRepositories } from './repositories';
import { tempDir } from './test-helpers';

let cleanup = () => {};
afterEach(() => cleanup());

async function setup() {
  const tmp = tempDir();
  cleanup = tmp.cleanup;
  const file = join(tmp.dir, 'postloom.sqlite');
  const backupDir = join(tmp.dir, 'backups');
  let clock = new Date('2026-09-24T09:00:00Z');
  const opened = await openDatabase({ file, backupDir, now: () => clock });
  const repos = createRepositories(opened.db);
  return {
    file,
    backupDir,
    opened,
    repos,
    setClock: (iso: string) => {
      clock = new Date(iso);
    },
  };
}

describe('backups', () => {
  it('takes one daily backup per day and keeps the last 7', async () => {
    const { opened, backupDir, setClock } = await setup();

    expect(opened.ensureDailyBackup()).not.toBeNull();
    expect(opened.ensureDailyBackup()).toBeNull();

    for (let day = 25; day <= 34; day++) {
      const date = new Date(Date.UTC(2026, 8, day, 9));
      setClock(date.toISOString());
      opened.ensureDailyBackup();
    }

    const daily = listBackups(backupDir).filter((b) => b.kind === 'daily');
    expect(daily).toHaveLength(7);
    expect(daily[0]!.createdAt.toISOString()).toBe('2026-10-04T09:00:00.000Z');
    await opened.close();
  });

  it('lists backups newest first with their kind', async () => {
    const { opened, backupDir, setClock } = await setup();
    opened.backupNow('manual');
    setClock('2026-09-24T10:00:00Z');
    opened.backupNow('daily');

    const backups = listBackups(backupDir);
    expect(backups.map((b) => b.kind)).toEqual(['daily', 'manual']);
    expect(backups[0]!.sizeBytes).toBeGreaterThan(0);
    await opened.close();
  });

  it('ignores unrelated files in the backup folder', async () => {
    const { opened, backupDir } = await setup();
    opened.backupNow('manual');
    writeFileSync(join(backupDir, 'notes.txt'), 'hello');
    writeFileSync(join(backupDir, 'postloom-oops.sqlite'), 'x');

    expect(listBackups(backupDir)).toHaveLength(1);
    await opened.close();
  });

  it('restores a backup and keeps the replaced file', async () => {
    const { opened, repos, file } = await setup();
    await repos.settings.set('theme', 'light');
    const backup = opened.backupNow('manual');
    await repos.settings.set('theme', 'dark');
    await opened.close();

    const kept = restoreBackup(file, backup, new Date('2026-09-24T12:00:00Z'));
    expect(existsSync(kept)).toBe(true);

    const reopened = await openDatabase({ file, backupDir: join(file, '..', 'backups') });
    expect(await createRepositories(reopened.db).settings.get('theme', 'none')).toBe('light');
    await reopened.close();
  });

  it('refuses to restore a damaged backup', async () => {
    const { opened, file, backupDir } = await setup();
    await opened.close();
    mkdirSync(backupDir, { recursive: true });
    const bad = join(backupDir, 'postloom-manual-2026-09-24T09-00-00-000Z.sqlite');
    writeFileSync(bad, 'garbage'.repeat(100));
    const before = readFileSync(file);

    expect(() => restoreBackup(file, bad, new Date())).toThrow();
    expect(readFileSync(file).equals(before)).toBe(true);
  });
});
