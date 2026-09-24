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
      include: ['packages/*/src/**', 'apps/desktop/src/**'],
      exclude: ['**/*.test.*', '**/index.ts', '**/*.d.ts'],
      reporter: ['text', 'html', 'lcov'],
    },
  },
});
