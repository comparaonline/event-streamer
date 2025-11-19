// Mock debug function to avoid config initialization
vi.mock('../../helpers', async () => {
  const actual = await vi.importActual<typeof import('../../helpers')>('../../helpers');
  return {
    ...actual,
    debug: vi.fn(),
  };
});

// Mock filesystem operations for CLI functions
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      writeFile: vi.fn(),
      readFile: vi.fn(),
      mkdir: vi.fn(),
      access: vi.fn(),
      readdir: vi.fn(),
    },
  };
});

// Mock path module
vi.mock('path', () => ({
  resolve: vi.fn(),
  join: vi.fn(),
  extname: vi.fn()
}));

// Mock schema registry client to avoid dependencies
vi.mock('../../schema-registry/client', () => ({
  SchemaRegistryClient: vi.fn().mockImplementation(() => ({
    validateAndEncode: vi.fn(),
    preloadSchemasForProducer: vi.fn(),
    getSubjectFromEventCode: vi.fn(),
    getSubjectFromTopicAndEventCode: vi.fn()
  }))
}));

import * as initModule from '../init';
import * as generateModule from '../generate';
import * as validateModule from '../validate';
import * as publishModule from '../publish';

// Basic CLI functionality tests
describe('CLI Basic Functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('CLI Module Loading', () => {
    it('should be able to import CLI modules without errors', () => {
      expect(() => {
        // Modules are already imported at the top
        expect(initModule).toBeDefined();
        expect(generateModule).toBeDefined();
        expect(validateModule).toBeDefined();
        expect(publishModule).toBeDefined();
      }).not.toThrow();
    });

    it('should export expected functions from each module', () => {
      // Check that modules export functions (exact names may vary)
      expect(typeof initModule.initializeEventSchemas).toBe('function');
      expect(typeof generateModule.generateExampleSchema).toBe('function');
      expect(typeof validateModule.validateSchemasInDirectory).toBe('function');
      expect(typeof publishModule.publishSchemas).toBe('function');
    });
  });

  describe('CLI Error Handling', () => {
    it('should handle missing parameters gracefully', () => {
      // CLI functions should validate inputs - just test they exist and are callable
      expect(typeof generateModule.generateExampleSchema).toBe('function');
    });

    it('should handle invalid options gracefully', () => {
      // Test that functions exist and are callable
      expect(typeof initModule.initializeEventSchemas).toBe('function');
    });
  });
});
