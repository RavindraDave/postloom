import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'desktop-main',
    environment: 'node',
    include: ['src/main/**/*.test.ts'],
  },
});
