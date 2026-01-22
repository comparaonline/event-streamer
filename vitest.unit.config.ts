import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      'src/**/*.integration.test.ts',
      'src/consumer/__tests__/index.test.ts',
      'src/producer/__tests__/index.test.ts',
    ],
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

