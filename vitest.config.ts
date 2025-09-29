import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    // By default, Vitest includes all spec/test files.
    // We only need to exclude the integration tests for the default run.
    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        'src/local-tests',
        'src/test',
        'src/__fixtures__',
        'src/cli',
        'src/interfaces',
        'src/types',
        '**/*.test.ts',
        '**/*.integration.test.ts',
      ],
    },
  },
});
