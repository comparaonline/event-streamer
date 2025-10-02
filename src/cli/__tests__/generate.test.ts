import { generateExampleSchema } from '../generate';
import { promises as fs } from 'fs';

// Mock filesystem operations
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      mkdir: vi.fn(),
      writeFile: vi.fn(),
      access: vi.fn(),
    },
  };
});

// Mock debug function to avoid config initialization
vi.mock('../../helpers', async () => {
  const actual = await vi.importActual<typeof import('../../helpers')>('../../helpers');
  return {
    ...actual,
    debug: vi.fn(),
  };
});

const mockFs = fs as vi.Mocked<typeof fs>;

describe('CLI Generate Command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateExampleSchema', () => {
    it('should generate schema with PascalCase event name', async () => {
      const eventName = 'user-created';
      const options = {
        outputDir: '/test/events',
        serviceName: 'user-service'
      };

      mockFs.access.mockRejectedValue(new Error('File does not exist'));

      await generateExampleSchema(eventName, options);

      const writeCall = mockFs.writeFile.mock.calls[0];
      const [filePath, content] = writeCall;

      expect(filePath).toMatch(/user-created\.ts$/);
      expect(content).toContain('UserCreatedSchema');
      expect(content).toContain('createUserCreated');
      expect(content).toContain('export type UserCreated');
    });

    it('should include proper imports in generated schema', async () => {
      const eventName = 'order-processed';
      const options = {
        outputDir: '/test/events'
      };

      mockFs.access.mockRejectedValue(new Error('File does not exist'));

      await generateExampleSchema(eventName, options);

      const content = mockFs.writeFile.mock.calls[0][1] as string;

      expect(content).toContain("import { z } from 'zod'");
      expect(content).toContain("import { randomUUID } from 'crypto'");
      expect(content).toContain("import { BaseEventSchema } from '@comparaonline/event-streamer'");
    });

    it('should include service name in factory function when provided', async () => {
      const eventName = 'payment-completed';
      const options = {
        outputDir: '/test/events',
        serviceName: 'payment-service'
      };

      mockFs.access.mockRejectedValue(new Error('File does not exist'));

      await generateExampleSchema(eventName, options);

      const content = mockFs.writeFile.mock.calls[0][1] as string;

      expect(content).toContain("|| 'payment-service'");
    });

    it('should not overwrite existing schema files', async () => {
      const eventName = 'existing-event';
      const options = {
        outputDir: '/test/events'
      };

      // Mock existing file
      mockFs.access.mockResolvedValue(undefined);

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation();

      await generateExampleSchema(eventName, options);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('File already exists'));
      expect(mockFs.writeFile).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle complex event names correctly', async () => {
      const eventName = 'user_registration_completed_event';
      const options = {
        outputDir: '/test/events'
      };

      mockFs.access.mockRejectedValue(new Error('File does not exist'));

      await generateExampleSchema(eventName, options);

      const content = mockFs.writeFile.mock.calls[0][1] as string;

      expect(content).toContain('UserRegistrationCompletedEventSchema');
      expect(content).toContain('createUserRegistrationCompletedEvent');
      expect(content).toContain('export type UserRegistrationCompletedEvent');
    });

    it('should create output directory if it does not exist', async () => {
      const eventName = 'new-event';
      const options = {
        outputDir: '/new/events/dir'
      };

      mockFs.access.mockRejectedValue(new Error('File does not exist'));

      await generateExampleSchema(eventName, options);

      expect(mockFs.mkdir).toHaveBeenCalledWith('/new/events/dir', { recursive: true });
    });

    it('should handle filesystem errors gracefully', async () => {
      const eventName = 'error-event';
      const options = {
        outputDir: '/invalid/path'
      };

      mockFs.mkdir.mockRejectedValue(new Error('Permission denied'));

      await expect(generateExampleSchema(eventName, options)).rejects.toThrow('Failed to generate schema for error-event');
    });
  });
});
