import { createRepositories, openDatabase } from '@postloom/db';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseLocation, openAppDatabase, restorePendingBackup } from './database';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'postloom-app-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('openAppDatabase', () => {
  it('opens the database in the data folder and takes the daily backup', async () => {
    const location = databaseLocation(dir);
    const opened = await openAppDatabase(location, vi.fn());

    expect(opened).not.toBeNull();
    expect(location.file).toBe(join(dir, 'postloom.sqlite'));
    await opened?.close();
  });

  it('asks before restoring a backup over a damaged file', async () => {
    const location = databaseLocation(dir);
    const first = await openDatabase(location);
    await createRepositories(first.db).settings.set('marker', 'from backup');
    first.backupNow('daily');
    await first.close();
    writeFileSync(location.file, 'damaged'.repeat(500));
    rmSync(`${location.file}-wal`, { force: true });

    const ask = vi.fn(() => 'restore-latest' as const);
    const opened = await openAppDatabase(location, ask);

    expect(ask).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: expect.any(String) as string }),
    );
    expect(await createRepositories(opened!.db).settings.get('marker', null)).toBe('from backup');
    await opened?.close();
  });

  it('leaves the file alone when the person chooses to quit', async () => {
    const location = databaseLocation(dir);
    writeFileSync(location.file, 'damaged'.repeat(500));

    const ask = vi.fn(() => 'quit' as const);
    expect(await openAppDatabase(location, ask)).toBeNull();
    expect(ask).toHaveBeenCalledWith(null);
  });
});

describe('restoring a backup chosen in Settings', () => {
  it('restores it before the database opens, once', async () => {
    const location = databaseLocation(dir);
    const first = await openDatabase(location);
    const repos = createRepositories(first.db);
    await repos.settings.set('marker', 'from backup');
    const backup = first.backupNow('manual');
    await repos.settings.set('marker', 'changed later');
    await first.close();

    const pending = join(dir, 'restore-pending.json');
    writeFileSync(pending, JSON.stringify({ fileName: backup.split(/[\\/]/).pop() }));
    expect(restorePendingBackup(location, pending)).toMatch(/^postloom-manual-/);
    expect(existsSync(pending)).toBe(false);

    const reopened = await openDatabase(location);
    expect(await createRepositories(reopened.db).settings.get('marker', null)).toBe('from backup');
    await reopened.close();
    // Nothing pending: nothing happens.
    expect(restorePendingBackup(location, pending)).toBeNull();
  });

  it('ignores a name that isn’t one of the backups', () => {
    const location = databaseLocation(dir);
    const pending = join(dir, 'restore-pending.json');
    writeFileSync(pending, JSON.stringify({ fileName: '../../elsewhere.sqlite' }));
    expect(restorePendingBackup(location, pending)).toBeNull();
    expect(existsSync(pending)).toBe(false);
  });
});
