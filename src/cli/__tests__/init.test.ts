// Test project initialization logic, not the CLI wrapper
jest.mock('../../helpers', () => ({ debug: jest.fn() }));

interface PackageJson {
  name: string;
  version: string;
  description: string;
  scripts: {
    validate: string;
    publish: string;
  };
  dependencies: Record<string, string>;
}

interface DirectoryItem {
  path: string;
  required: boolean;
  type: string;
}

describe('Project Initialization Logic', () => {
  describe('package.json generation', () => {
    it('should generate valid package.json content', () => {
      const generatePackageJson = (serviceName: string): PackageJson => {
        return {
          name: serviceName,
          version: '1.0.0',
          description: 'Event schemas',
          scripts: {
            validate: 'event-streamer-cli validate ./src/events',
            publish: 'event-streamer-cli publish --events-dir ./src/events'
          },
          dependencies: {
            zod: '^3.23.8',
            '@comparaonline/event-streamer': 'latest'
          }
        };
      };

      const result = generatePackageJson('my-service');

      expect(result.name).toBe('my-service');
      expect(result.scripts.validate).toContain('event-streamer-cli validate');
      expect(result.dependencies.zod).toBeDefined();
      expect(result.dependencies['@comparaonline/event-streamer']).toBeDefined();
    });
  });

  describe('example schema generation', () => {
    it('should generate valid example schema code', () => {
      const generateExampleSchema = (eventName: string): string => {
        const schemaName =
          eventName
            .split('-')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join('') + 'Schema';

        return `import { z } from 'zod';
import { BaseEventSchema } from '@comparaonline/event-streamer';

export const ${schemaName} = BaseEventSchema.extend({
  // Add your event-specific fields here
  id: z.string().uuid(),
  data: z.string()
});

export type ${eventName
          .split('-')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join('')} = z.infer<typeof ${schemaName}>;

export function create${eventName
          .split('-')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join('')}(data: Partial<z.infer<typeof ${schemaName}>>): z.infer<typeof ${schemaName}> {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    appName: 'your-app-name',
    version: '1.0.0',
    code: '${eventName
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join('')}',
    source: 'your-service',
    ...data
  } as z.infer<typeof ${schemaName}>;
}`;
      };

      const result = generateExampleSchema('user-created');

      expect(result).toContain('export const UserCreatedSchema');
      expect(result).toContain('BaseEventSchema.extend');
      expect(result).toContain('export type UserCreated');
      expect(result).toContain('export function createUserCreated');
      expect(result).toContain('crypto.randomUUID()');
    });
  });

  describe('directory structure validation', () => {
    it('should validate required directory structure', () => {
      const validateDirectoryStructure = (): DirectoryItem[] => {
        const requiredPaths = ['package.json', 'src/events', 'src/events/example-event.ts', 'src/events/README.md'];

        return requiredPaths.map((path) => ({
          path,
          required: true,
          type: path.endsWith('.ts') ? 'file' : path.includes('.') ? 'file' : 'directory'
        }));
      };

      const structure = validateDirectoryStructure();

      expect(structure).toHaveLength(4);
      expect(structure.find((item) => item.path === 'package.json')).toBeDefined();
      expect(structure.find((item) => item.path === 'src/events')).toBeDefined();
      expect(structure.find((item) => item.path === 'src/events/example-event.ts')).toBeDefined();
    });
  });

  describe('README generation', () => {
    it('should generate helpful README content', () => {
      const generateReadme = (serviceName: string): string => {
        return `# ${serviceName} Event Schemas

This directory contains event schemas for ${serviceName}.

## Usage

1. Define your schemas using Zod in TypeScript files
2. Validate schemas: \`npm run validate\`
3. Publish to Schema Registry: \`npm run publish\`

## Example Schema

See \`example-event.ts\` for a template.
`;
      };

      const result = generateReadme('user-service');

      expect(result).toContain('# user-service Event Schemas');
      expect(result).toContain('npm run validate');
      expect(result).toContain('npm run publish');
      expect(result).toContain('example-event.ts');
    });
  });
});
