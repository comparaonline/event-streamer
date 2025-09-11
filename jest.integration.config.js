module.exports = {
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  roots: ['src/'],
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverage: false, // Skip coverage for integration tests
  // Only run integration tests
  testMatch: [
    '**/src/schema-registry/__tests__/integration.test.ts',
    '**/src/schema-registry/__tests__/mixed-formats.test.ts', 
    '**/src/schema-registry/__tests__/schema-evolution.test.ts',
    '**/src/schema-registry/__tests__/simple-integration.test.ts',
    '**/src/schema-registry/__tests__/debug-encoding.test.ts'
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testTimeout: 60000 // Longer timeout for integration tests
};