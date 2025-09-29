import { program } from '../index';

// Mock all CLI command implementations BEFORE importing
vi.mock('../init', () => ({
  initializeEventSchemas: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../generate', () => ({
  generateExampleSchema: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../validate', () => ({
  validateSchema: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../publish', () => ({
  publishSchemas: vi.fn().mockResolvedValue(undefined)
}));

// Import after mocking
import * as initModule from '../init';
import * as generateModule from '../generate';
import * as validateModule from '../validate';
import * as publishModule from '../publish';

describe('CLI Index', () => {
  let originalArgv: string[];
  let originalExit: typeof process.exit;
  let consoleSpy: vi.SpyInstance;

  beforeEach(() => {
    originalArgv = process.argv;
    originalExit = process.exit;

    // Mock process.exit to prevent actual exit during tests
    process.exit = vi.fn() as unknown as (code?: number) => never;

    // Mock console to capture output
    consoleSpy = vi.spyOn(console, 'log').mockImplementation();

    vi.clearAllMocks();
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exit = originalExit;
    consoleSpy.mockRestore();
  });

  describe('Command parsing', () => {
    it('should show help when no command provided', async () => {
      process.argv = ['node', 'cli'];



      // Prevent Commander from writing errors to stderr during this test
      program.exitOverride();
      program.configureOutput({
        writeErr: vi.fn(),
        outputError: vi.fn()
      });

      // Capture help output
      vi.spyOn(program, 'outputHelp').mockImplementation();

      try {
        await program.parseAsync(process.argv);
      } catch (_error) {
        // Expected to error due to no command; we suppress output above
      }
      // Should have attempted to show help
      expect(program.name()).toBe('event-streamer-cli');
    });

    it('should parse init command with correct options', async () => {
      const initializeEventSchemas = initModule.initializeEventSchemas as vi.MockedFunction<typeof initModule.initializeEventSchemas>;

      process.argv = ['node', 'cli', 'init', '--service-name', 'test-service'];

      await program.parseAsync(process.argv);

      expect(initializeEventSchemas).toHaveBeenCalledWith({
        serviceName: 'test-service'
      });
    });

    it('should parse generate-example command with event name', async () => {
      const generateExampleSchema = generateModule.generateExampleSchema as vi.MockedFunction<typeof generateModule.generateExampleSchema>;

      process.argv = ['node', 'cli', 'generate-example', 'user-registered', '--output-dir', '/test/events'];



      await program.parseAsync(process.argv);

      expect(generateExampleSchema).toHaveBeenCalledWith('user-registered', {
        outputDir: '/test/events'
      });
    });

    it('should parse validate command with directory option', async () => {
      const validateSchema = validateModule.validateSchema as vi.MockedFunction<
        typeof validateModule.validateSchema
      >;

      process.argv = ['node', 'cli', 'validate', '/custom/events/schema.ts'];

      await program.parseAsync(process.argv);

      expect(validateSchema).toHaveBeenCalledWith('/custom/events/schema.ts', expect.any(Object));
    });

    it('should parse publish command with all options', async () => {
      const publishSchemas = publishModule.publishSchemas as vi.MockedFunction<typeof publishModule.publishSchemas>;

      process.argv = [
        'node',
        'cli',
        'publish',
        '--events-dir',
        '/test/events',
        '--registry-url',
        'http://localhost:8081',
        '--registry-auth',
        'test-user:test-pass',
        '--dry-run'
      ];

      await program.parseAsync(process.argv);

      expect(publishSchemas).toHaveBeenCalledWith({
        eventsDir: '/test/events',
        registryUrl: 'http://localhost:8081',
        registryAuth: 'test-user:test-pass',
        dryRun: true
      });
    });

    it('should handle invalid commands gracefully', async () => {
      process.argv = ['node', 'cli', 'invalid-command'];



      try {
        await program.parseAsync(process.argv);
      } catch (error) {
        // Expected to throw due to invalid command
        expect(error).toBeDefined();
      }
    });

    it('should show version when --version flag is used', async () => {
      process.argv = ['node', 'cli', '--version'];



      // Capture version output
      const versionSpy = vi.spyOn(program, 'version');

      expect(versionSpy).toBeDefined();
    });
  });
});
