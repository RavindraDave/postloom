import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/*',
      'apps/desktop/vitest.main.config.ts',
      'apps/desktop/vitest.renderer.config.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.{ts,tsx}', 'apps/desktop/src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.test.*',
        '**/index.ts',
        '**/*.d.ts',
        '**/test-helpers.ts',
        '**/fixtures.ts',
        '**/test/**',
      ],
      reporter: ['text', 'html', 'lcov'],
      // PLAN.md §13: core ≥ 90%; everything else may not drop below today's level.
      thresholds: {
        lines: 85,
        statements: 85,
        functions: 85,
        branches: 75,
        'packages/core/src/**': { lines: 90, statements: 90, functions: 90, branches: 85 },
      },
    },
  },
});
