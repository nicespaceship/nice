import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['app/js/__tests__/**/*.test.js'],
    setupFiles: ['app/js/__tests__/setup.js'],
    coverage: {
      provider: 'v8',
      include: ['app/js/lib/**/*.js'],
      reporter: ['text', 'html', 'json-summary'],
    },
  },
});
