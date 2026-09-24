import { createRepositories, openDatabase } from '@postloom/db';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseLocation, openAppDatabase } from './database';

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
