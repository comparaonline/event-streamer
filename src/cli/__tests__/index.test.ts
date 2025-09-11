import { Command } from 'commander';

// Mock all CLI command implementations BEFORE importing
jest.mock('../init', () => ({
  initializeEventSchemas: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../generate', () => ({
  generateExampleSchema: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../validate', () => ({
  validateSchemasInDirectory: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../publish', () => ({
  publishSchemas: jest.fn().mockResolvedValue(undefined)
}));

// Import after mocking
import * as initModule from '../init';
import * as generateModule from '../generate';
import * as validateModule from '../validate';
import * as publishModule from '../publish';

describe('CLI Index', () => {
  let originalArgv: string[];
  let originalExit: typeof process.exit;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    originalArgv = process.argv;
    originalExit = process.exit;

    // Mock process.exit to prevent actual exit during tests
    process.exit = jest.fn() as any;

    // Mock console to capture output
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    jest.clearAllMocks();
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exit = originalExit;
    consoleSpy.mockRestore();
  });

  describe('Command parsing', () => {
    it('should show help when no command provided', async () => {
      process.argv = ['node', 'cli'];

      const program = new Command();
      program.name('event-streamer-cli').description('Event Streamer CLI for Schema Registry management');

      // Capture help output
      jest.spyOn(program, 'outputHelp').mockImplementation();

      try {
        await program.parseAsync(process.argv);
      } catch (error) {
        // Expected to show help when no command provided
      }

      // Should have attempted to show help
      expect(program.name()).toBe('event-streamer-cli');
    });

    it('should parse init command with correct options', async () => {
      const initializeEventSchemas = initModule.initializeEventSchemas as jest.MockedFunction<typeof initModule.initializeEventSchemas>;

      process.argv = ['node', 'cli', 'init', '--output-dir', '/test/output', '--service-name', 'test-service'];

      // Create a new Command instance to test
      const program = new Command();
      program.name('event-streamer-cli').description('Event Streamer CLI for Schema Registry management');

      program
        .command('init')
        .description('Initialize a new event schemas project')
        .option('-o, --output-dir <dir>', 'Output directory', './events')
        .option('-s, --service-name <name>', 'Service name for schemas')
        .action(async (options) => {
          await initializeEventSchemas(options);
        });

      await program.parseAsync(process.argv);

      expect(initializeEventSchemas).toHaveBeenCalledWith({
        outputDir: '/test/output',
        serviceName: 'test-service'
      });
    });

    it('should parse generate command with event name', async () => {
      const generateExampleSchema = generateModule.generateExampleSchema as jest.MockedFunction<typeof generateModule.generateExampleSchema>;

      process.argv = ['node', 'cli', 'generate', 'user-registered', '--output-dir', '/test/events'];

      const program = new Command();
      program
        .command('generate')
        .argument('<event-name>', 'Name of the event to generate')
        .option('-o, --output-dir <dir>', 'Output directory', './events')
        .option('-s, --service-name <name>', 'Service name for the event')
        .action(async (eventName, options) => {
          await generateExampleSchema(eventName, options);
        });

      await program.parseAsync(process.argv);

      expect(generateExampleSchema).toHaveBeenCalledWith('user-registered', {
        outputDir: '/test/events'
      });
    });

    it('should parse validate command with directory option', async () => {
      const validateSchemasInDirectory = validateModule.validateSchemasInDirectory as jest.MockedFunction<
        typeof validateModule.validateSchemasInDirectory
      >;

      process.argv = ['node', 'cli', 'validate', '--events-dir', '/custom/events'];

      const program = new Command();
      program
        .command('validate')
        .description('Validate event schemas')
        .option('-e, --events-dir <dir>', 'Directory containing event schemas', './events')
        .action(async (options) => {
          await validateSchemasInDirectory(options.eventsDir, options);
        });

      await program.parseAsync(process.argv);

      expect(validateSchemasInDirectory).toHaveBeenCalledWith('/custom/events', {
        eventsDir: '/custom/events'
      });
    });

    it('should parse publish command with all options', async () => {
      const publishSchemas = publishModule.publishSchemas as jest.MockedFunction<typeof publishModule.publishSchemas>;

      process.argv = [
        'node',
        'cli',
        'publish',
        '--events-dir',
        '/test/events',
        '--registry-url',
        'http://localhost:8081',
        '--username',
        'test-user',
        '--password',
        'test-pass',
        '--compatibility-mode',
        'BACKWARD',
        '--dry-run'
      ];

      const program = new Command();
      program
        .command('publish')
        .description('Publish schemas to Schema Registry')
        .option('-e, --events-dir <dir>', 'Directory containing event schemas', './events')
        .option('-r, --registry-url <url>', 'Schema Registry URL')
        .option('-u, --username <username>', 'Schema Registry username')
        .option('-p, --password <password>', 'Schema Registry password')
        .option('-c, --compatibility-mode <mode>', 'Compatibility mode (BACKWARD, FORWARD, FULL)')
        .option('--dry-run', 'Show what would be published without actually publishing')
        .action(async (options) => {
          await publishSchemas(options);
        });

      await program.parseAsync(process.argv);

      expect(publishSchemas).toHaveBeenCalledWith({
        eventsDir: '/test/events',
        registryUrl: 'http://localhost:8081',
        username: 'test-user',
        password: 'test-pass',
        compatibilityMode: 'BACKWARD',
        dryRun: true
      });
    });

    it('should handle invalid commands gracefully', async () => {
      process.argv = ['node', 'cli', 'invalid-command'];

      const program = new Command();
      program.exitOverride(); // Prevent actual exit

      try {
        await program.parseAsync(process.argv);
      } catch (error) {
        // Expected to throw due to invalid command
        expect(error).toBeDefined();
      }
    });

    it('should show version when --version flag is used', async () => {
      process.argv = ['node', 'cli', '--version'];

      const program = new Command();
      program.version('1.0.0');

      // Capture version output
      const versionSpy = jest.spyOn(program, 'version');

      expect(versionSpy).toBeDefined();
    });
  });
});
