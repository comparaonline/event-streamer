// Jest setup file for unit tests
// This file runs before each test file

// Mock process.env for consistent test behavior
process.env.NODE_ENV = 'test';
process.env.RUN_INTEGRATION_TESTS = 'false'; // Explicitly disable integration tests for unit tests

// Set reasonable test timeouts
jest.setTimeout(15000);

// Global test setup
beforeAll(() => {
  // Silence console.log during tests unless NODE_ENV=debug
  if (process.env.NODE_ENV !== 'debug') {
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  }
});

afterAll(async () => {
  // Restore console methods
  if (console.log.mockRestore) console.log.mockRestore();
  if (console.warn.mockRestore) console.warn.mockRestore();
  if (console.error.mockRestore) console.error.mockRestore();

  // Close all lingering producer connections
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { closeAll } = require('./src/producer');
  await closeAll();
});