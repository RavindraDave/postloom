import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A throwaway folder per test; call `cleanup()` in afterEach. */
export function tempDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'postloom-db-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** A clock that advances one second per call, for predictable timestamps. */
export function steppingClock(start = '2026-09-24T09:00:00.000Z'): () => Date {
  let t = new Date(start).getTime();
  return () => {
    const d = new Date(t);
    t += 1000;
    return d;
  };
}
