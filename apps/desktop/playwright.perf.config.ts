import { defineConfig } from '@playwright/test';

/**
 * Performance budgets (PLAN.md §15.3). Run on their own, on one kind of
 * machine (CI: Linux), so timings compare from run to run.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'performance.spec.ts',
  timeout: 10 * 60_000,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: { trace: 'retain-on-failure' },
});
