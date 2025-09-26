module.exports = {
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  roots: ['src/'],
  testEnvironment: 'node',
  testRegex: 'src(/.*)?/__tests__/[^/]*\\.test\\.(ts|js)$',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.{ts,js}', '!src/**/*.d.ts', '!src/**/__tests__/**/*.*', '!src/test/**/*.*', '!src/local-tests/**/*.*'],
  coverageReporters: ['text-summary', 'lcov', 'html'],
  globalSetup: '<rootDir>/jest.globalSetup.js',
  coverageThreshold: {
    global: {
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0
    }
  },
  // Skip integration tests by default - only run unit tests
  testPathIgnorePatterns: [
    'src/schema-registry/__tests__/integration.test.ts',
    'src/schema-registry/__tests__/mixed-formats.test.ts', 
    'src/schema-registry/__tests__/schema-evolution.test.ts',
    'src/schema-registry/__tests__/simple-integration.test.ts',
    'src/schema-registry/__tests__/debug-encoding.test.ts',
    'src/consumer/__tests__/index.integration.test.ts',
    'src/producer/__tests__/index.integration.test.ts'
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js']
};
