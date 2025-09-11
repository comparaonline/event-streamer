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
  coverageThreshold: {
    global: {
      branches: 50, // Realistic for unit tests only
      functions: 50,
      lines: 50,
      statements: 50
    }
  },
  // Skip integration tests by default - only run unit tests
  testPathIgnorePatterns: [
    'src/schema-registry/__tests__/integration.test.ts',
    'src/schema-registry/__tests__/mixed-formats.test.ts', 
    'src/schema-registry/__tests__/schema-evolution.test.ts'
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js']
};
