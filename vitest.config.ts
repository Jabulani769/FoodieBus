import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['src/generated/**', 'src/server.ts', 'src/shared/types/**'],
    },
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
