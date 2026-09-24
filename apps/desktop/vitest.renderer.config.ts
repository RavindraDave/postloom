import react from '@vitejs/plugin-react';
import { defineProject } from 'vitest/config';

export default defineProject({
  plugins: [react()],
  test: {
    name: 'desktop-renderer',
    environment: 'jsdom',
    include: ['src/renderer/**/*.test.tsx'],
    setupFiles: ['src/renderer/src/test/setup.ts'],
    css: false,
  },
});
